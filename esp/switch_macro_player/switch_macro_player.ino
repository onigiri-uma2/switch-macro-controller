#include "SwitchHID.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <M5AtomS3.h>
#include <NimBLEDevice.h>

/**
 * =========================================================================
 * ATOMS3 Switch Macro Player
 *
 * 役割:
 * 1.
 * PC(ブラウザ)から送られてくるマクロを受信し、内部ファイルシステム(LittleFS)に保存する。
 * 2. 保存されたマクロを読み込み、Switch用のUSBコントローラーとして再生する。
 * 3. ブラウザからのリアルタイム入力をSwitchに中継する (Live Bridge機能)。
 * =========================================================================
 */

// --- BLE (Bluetooth Low Energy) 定数定義 ---
// サービスとキャラクタリスティックのUUID。ブラウザ側の定義と一致させる必要があります。
#define SERVICE_UUID "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define MACRO_FILE "/macro.json" // マクロを保存するファイル名

// --- デバイス状態の定義 (ステートマシン) ---
enum DeviceStatus {
  STATUS_IDLE,         // 待機中: 初期状態、またはマクロがない状態
  STATUS_CONNECTED,    // BLE接続済み: ブラウザとつながっている状態
  STATUS_TRANSFERRING, // 転送中: ブラウザからマクロデータを受信している最中
  STATUS_READY,   // 準備完了: マクロの読み込みが完了し、いつでも再生できる状態
  STATUS_PLAYING, // 再生中: マクロを実行してUSBレポートを送信している状態
  STATUS_WAITING, // ループ待機中: 指定されたループ間隔の秒数を待っている状態
  STATUS_ERROR    // エラー: JSONパース失敗などの異常事態
};

// --- グローバル変数 ---
volatile DeviceStatus currentStatus = STATUS_IDLE; // 現在のデバイス状態
volatile bool statusChanged =
    true;             // 状態が変化したかどうかのフラグ (LED更新用)
String rxBuffer = ""; // BLE経由で届くマクロデーターの一時保存用バッファ
DynamicJsonDocument *currentMacro =
    nullptr;                    // メモリ上に展開されたJSONマクロデータ
SwitchControllerHID controller; // Switch用USB HIDクラスのインスタンス

/**
 * @brief マクロの再生・実行を管理するクラス
 * 複雑になりがちなマクロの再生制御(インデックス管理、ループ、時間同期)をカプセル化しています。
 */
class MacroPlayer {
public:
  int eventIndex = 0;              // 現在処理しているマクロイベントの番号
  unsigned long startTime = 0;     // マクロ再生を開始した時刻 (millis)
  unsigned long waitStartTime = 0; // ループ間の待機を開始した時刻
  int remainingLoops = 0;          // 残りのループ回数 (0なら無限)

  bool loopEnabled = false; // ループ再生が有効か
  int loopCount = 0;        // 設定された総ループ回数
  int loopInterval = 0;     // ループ間の待機秒数

  /**
   * @brief JSONマクロからループ再生などの設定を読み込む
   */
  void loadSettings(DynamicJsonDocument *macro) {
    if (!macro)
      return;
    JsonObject loop = (*macro)["loop"];
    loopEnabled = loop["enabled"] | false;
    loopCount = loop["count"] | 0;
    loopInterval = loop["interval"] | 0;
  }

  /**
   * @brief 再生パラメータを初期化して開始する
   */
  void start() {
    eventIndex = 0;
    startTime = millis();
    // 0以外の設定があれば、その回数分。そうでなければ1回（または無限）。
    remainingLoops = loopEnabled ? (loopCount == 0 ? 0 : loopCount) : 1;
  }

  /**
   * @brief ボタンビットマスクとアナログ値をUSB HIDレポートに変換して送信する
   *
   * @param buttons 32bitのビットマスク
   * (下位14bitが通常ボタン、16-19bitが十字キー)
   * @param lx 左スティックX (-128〜127)
   * @param ly 左スティックY (-128〜127)
   * @param rx 右スティックX (-128〜127)
   * @param ry 右スティックY (-128〜127)
   */
  bool updateHID(uint32_t buttons, int8_t lx, int8_t ly, int8_t rx, int8_t ry) {
    // 一度すべての入力をクリア (releaseAll)
    // してから新しい状態をセットする方式をとっています
    controller.releaseAll();

    // 1. 通常ボタンの一括設定 (ビット0〜13)
    // ライブラリのセットメソッドを使用。内部で物理HIDのビット位置にそのまま入ります。
    controller.setButtonMask((uint16_t)(buttons & 0x3FFF));

    // 2. 十字キー (16〜19bit) からハットスイッチへの変換
    // SwitchのHID仕様では十字キーはボタンではなく「角度（ハットスイッチ）」で表現されます。
    bool u = buttons & (1 << 16), d = buttons & (1 << 17),
         l = buttons & (1 << 18), r = buttons & (1 << 19);

    if (u && r)
      controller.setHat(Hat::TOP_RIGHT);
    else if (u && l)
      controller.setHat(Hat::TOP_LEFT);
    else if (d && r)
      controller.setHat(Hat::BOTTOM_RIGHT);
    else if (d && l)
      controller.setHat(Hat::BOTTOM_LEFT);
    else if (u)
      controller.setHat(Hat::TOP);
    else if (d)
      controller.setHat(Hat::BOTTOM);
    else if (l)
      controller.setHat(Hat::LEFT);
    else if (r)
      controller.setHat(Hat::RIGHT);
    else
      controller.setHat(Hat::CENTER); // どこも押されていない場合

    // 3. スティックの設定 (-128〜127 の相対値を、0〜255 の絶対値に変換)
    controller.setLeftStickRaw((uint8_t)(lx + 128), (uint8_t)(ly + 128));
    controller.setRightStickRaw((uint8_t)(rx + 128), (uint8_t)(ry + 128));

    // 生成されたレポートをUSB経由でSwitchに送信
    return controller.send();
  }

  /**
   * @brief
   * JSON形式の特定イベント(時刻、ボタン、スティック)を解釈してHID送信する
   */
  bool updateFromEvent(JsonObject event) {
    uint32_t buttons = 0;
    // Json形式のビットインデックス配列 [0, 2, 5]
    // などを一つの32bit整数マスクに変換
    for (int b : event["b"].as<JsonArray>())
      buttons |= (1 << b);

    // スティック値 (-1.0 〜 1.0 のfloat) を int8_t 範囲にスケール
    JsonArray axes = event["a"];
    return updateHID(buttons, (int8_t)(axes[0].as<float>() * 127),
                     (int8_t)(axes[1].as<float>() * 127),
                     (int8_t)(axes[2].as<float>() * 127),
                     (int8_t)(axes[3].as<float>() * 127));
  }

  /**
   * @brief コントローラーの状態をニュートラルに戻し、レポートを送信する
   */
  void stop() { updateHID(0, 0, 0, 0, 0); }
};

MacroPlayer player; // 再生制御インスタンスの生成

// --- BLE (Bluetooth) 通信用コールバック定義 ---

/**
 * 接続/切断イベントの受け取り
 */
class MyServerCallbacks : public NimBLEServerCallbacks {
public:
  void onConnect(NimBLEServer *pServer, NimBLEConnInfo &connInfo) override {
    currentStatus = STATUS_CONNECTED;
    statusChanged = true;
  }
  void onDisconnect(NimBLEServer *pServer, NimBLEConnInfo &connInfo,
                    int reason) override {
    // 再生中やマクロ待機中の場合は、Bluetoothが切れてもオフラインで動作を継続させるため、
    // IDLEに戻さずそのままの状態を維持します。
    if (currentStatus != STATUS_PLAYING && currentStatus != STATUS_WAITING &&
        currentStatus != STATUS_READY) {
      currentStatus = STATUS_IDLE;
      statusChanged = true;
    }
  }
};

/**
 * データ書き込み(ブラウザからの送信)イベントの受け取り
 */
class MyCallbacks : public NimBLECharacteristicCallbacks {
public:
  void onWrite(NimBLECharacteristic *pCharacteristic,
               NimBLEConnInfo &connInfo) override {
    std::string value = pCharacteristic->getValue();

    /**
     * プロトコルA: リアルタイム中継 (Live Bridge)
     * フォーマット -> "L:ビットマスク:LX:LY:RX:RY"
     * 非常に低遅延な同期が求められるため、最優先で処理して早期リターンします。
     */
    if (value.length() > 2 && value[0] == 'L' && value[1] == ':') {
      String sVal = value.c_str();
      // 高速パース: デリミタ ':' の位置を検索して値を抜き出す
      int f = sVal.indexOf(':', 2), s = sVal.indexOf(':', f + 1),
          t = sVal.indexOf(':', s + 1), fo = sVal.indexOf(':', t + 1);

      // 最後(RY)は区切り文字がないので、fo+1以降すべてを取得
      player.updateHID(
          sVal.substring(2, f).toInt(), sVal.substring(f + 1, s).toInt(),
          sVal.substring(s + 1, t).toInt(), sVal.substring(t + 1, fo).toInt(),
          sVal.substring(fo + 1).toInt());
      return;
    }

    /**
     * プロトコルB: マクロデータの転送
     * "START:..." でバッファを初期化し、"END"
     * が届くまですべての文字列を結合します。
     */
    if (value.find("START:") == 0) {
      rxBuffer = ""; // 受信バッファのリセット
      currentStatus = STATUS_TRANSFERRING;
      statusChanged = true;
    } else if (value == "END") {
      // 受信完了。内部ストレージ(LittleFS)に書き込んで永続化します。
      File file = LittleFS.open(MACRO_FILE, FILE_WRITE);
      if (file) {
        file.print(rxBuffer);
        file.close();
      }

      // 既存のメモリ上のマクロを破棄して再ロード
      if (currentMacro)
        delete currentMacro;
      currentMacro = new DynamicJsonDocument(32768);

      if (deserializeJson(*currentMacro, rxBuffer)) {
        // JSONパースに失敗した場合
        currentStatus = STATUS_ERROR;
      } else {
        // 設定を反映して準備完了へ
        player.loadSettings(currentMacro);
        currentStatus = STATUS_READY;
      }
      statusChanged = true;
    } else if (currentStatus == STATUS_TRANSFERRING) {
      // START と END の間に届くデータをすべてバッファに追加
      rxBuffer += value.c_str();
    }
  }
};

// --- 初期化 (Entry Point) ---

void setup() {
  // ATOMS3 ハードウェア初期化
  AtomS3.begin(true);
  AtomS3.dis.setBrightness(20);
  AtomS3.dis.drawpix(0x00FFFF); // 水色: 初期セットアップ開始
  AtomS3.update();

  // ファイルシステム (LittleFS) の初期化
  if (!LittleFS.begin(true)) {
    AtomS3.dis.drawpix(0xFF0000); // 赤: ストレージ故障
    AtomS3.update();
    delay(1000);
  }

  // BLE機能の初期化
  NimBLEDevice::init("ATOMS3-Macro"); // 広告名 (スマホ等で見える名前)
  NimBLEServer *pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  NimBLEService *pService = pServer->createService(SERVICE_UUID);

  // マクロ受信用キャラクタリスティックの作成
  // WriteNR (No Response) を追加して高速化
  NimBLECharacteristic *pRxChar = pService->createCharacteristic(
      CHARACTERISTIC_UUID_RX, NIMBLE_PROPERTY::WRITE |
                                  NIMBLE_PROPERTY::WRITE_NR |
                                  NIMBLE_PROPERTY::READ);
  pRxChar->setCallbacks(new MyCallbacks());
  pService->start();

  // 広告開始 (他のデバイスから見つけられるようにする)
  NimBLEAdvertising *pAdvertising = NimBLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);

  // スキャンレスポンスに名前を含める (128bit UUIDがあるためパケット容量対策)
  NimBLEAdvertisementData scanResponseData;
  scanResponseData.setName("ATOMS3-Macro");
  pAdvertising->setScanResponseData(scanResponseData);

  pAdvertising->start();

  // USB HIDコントローラーとして動作開始
  USB.manufacturerName("HORI CO.,LTD.");
  // Revert to known-good PID for in-game testing
  USB.productName("Switch Controller");
  USB.VID(0x0f0d);
  USB.PID(0x0092);
  USB.usbClass(0);
  USB.usbSubClass(0);
  USB.usbProtocol(0);
  controller.begin();
  USB.begin();

  AtomS3.dis.drawpix(0xFF00FF); // 紫: USBスタック準備完了
  AtomS3.update();
  delay(500);

  // 保存されているマクロがあるか確認し、あれば起動時に自動ロードする
  if (LittleFS.exists(MACRO_FILE)) {
    File file = LittleFS.open(MACRO_FILE, FILE_READ);
    if (file) {
      if (currentMacro)
        delete currentMacro;
      currentMacro = new DynamicJsonDocument(32768);
      if (!deserializeJson(*currentMacro, file)) {
        player.loadSettings(currentMacro);
        currentStatus = STATUS_READY; // 緑: ロード成功、準備完了
      }
      file.close();
    }
  }
  statusChanged = true;
}

// --- メインループ (Main Process) ---

void loop() {
  AtomS3.update(); // ボタン状態の更新など

  // デバイス状態が変化した際にLEDの色を変更する
  if (statusChanged) {
    statusChanged = false;
    switch (currentStatus) {
    case STATUS_IDLE:
      AtomS3.dis.drawpix(0xFFFF00);
      break; // 黄色
    case STATUS_CONNECTED:
      AtomS3.dis.drawpix(0x0000FF);
      break; // 青
    case STATUS_TRANSFERRING:
      AtomS3.dis.drawpix(0x00FFFF);
      break; // 水色
    case STATUS_READY:
      AtomS3.dis.drawpix(0x00FF00);
      break; // 緑
    case STATUS_PLAYING:
      AtomS3.dis.drawpix(0xFF00FF);
      break; // 紫
    case STATUS_WAITING:
      AtomS3.dis.drawpix(0x00FFFF);
      break; // 水色
    case STATUS_ERROR:
      AtomS3.dis.drawpix(0xFF0000);
      break; // 赤
    }
    AtomS3.update();
  }

  // BLE接続が切れている場合に広告を維持/再開する
  if (!NimBLEDevice::getServer()->getConnectedCount()) {
    if (!NimBLEDevice::getAdvertising()->isAdvertising())
      NimBLEDevice::getAdvertising()->start();
  }

  /**
   * ATOMS3の前面ボタン(ボタンA)によるマクロの 「再生 / 停止」 制御
   */
  if (AtomS3.BtnA.wasPressed()) {
    if ((currentStatus == STATUS_READY || currentStatus == STATUS_IDLE ||
         currentStatus == STATUS_CONNECTED) &&
        currentMacro) {
      // 再生開始
      currentStatus = STATUS_PLAYING;
      statusChanged = true;
      player.start();
    } else if (currentStatus == STATUS_PLAYING) {
      // 再生停止
      currentStatus = NimBLEDevice::getServer()->getConnectedCount() > 0
                          ? STATUS_CONNECTED
                          : STATUS_READY;
      statusChanged = true;
      player.stop(); // ニュートラルに戻す
    }
  }

  /**
   * 再生ロジック:
   * 時刻(t)を監視し、現在の経過時間(millis -
   * startTime)がイベントの時刻を超えたら実行します。
   */
  if (currentStatus == STATUS_PLAYING && currentMacro) {
    JsonArray events = (*currentMacro)["events"];
    if (player.eventIndex >= events.size()) {
      // すべてのイベントを完了
      player.stop();

      // ループ再生の判定
      if (player.loopEnabled &&
          (player.loopCount == 0 || player.remainingLoops > 1)) {
        if (player.loopCount > 0)
          player.remainingLoops--;

        if (player.loopInterval > 0) {
          // ループ間の待ち時間がある場合
          currentStatus = STATUS_WAITING;
          statusChanged = true;
          player.waitStartTime = millis();
        } else {
          // 即座に最初からやり直す
          player.eventIndex = 0;
          player.startTime = millis();
        }
      } else {
        // 再生終了: 準備完了状態に戻る
        currentStatus = STATUS_READY;
        statusChanged = true;
      }
    } else {
      // マクロの途中
      JsonObject event = events[player.eventIndex];
      if (millis() - player.startTime >= (unsigned long)event["t"]) {
        // 指定時刻になったのでコントローラー入力を実行
        // 送信に成功した場合のみインデックスを進める (失敗したらリトライ)
        if (player.updateFromEvent(event)) {
          player.eventIndex++;
        }
      }
    }
  }

  /**
   * ループ待機ロジック:
   * 設定された秒数が経過したら、再度再生状態に戻ります。
   */
  else if (currentStatus == STATUS_WAITING) {
    if (millis() - player.waitStartTime >=
        (unsigned long)(player.loopInterval * 1000)) {
      currentStatus = STATUS_PLAYING;
      statusChanged = true;
      player.eventIndex = 0;
      player.startTime = millis();
    }
  }
}
