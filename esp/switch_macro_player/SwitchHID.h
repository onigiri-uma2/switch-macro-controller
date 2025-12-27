#pragma once

#include <Arduino.h>
#include <USB.h>
#include <USBHID.h>

/**
 * @brief Switchプロコンのボタン定義 (Switch物理HID仕様準拠)
 */
enum class Button : uint16_t {
  Y = 0x01,         // bit 0
  B = 0x02,         // bit 1
  A = 0x04,         // bit 2
  X = 0x08,         // bit 3
  L = 0x10,         // bit 4
  R = 0x20,         // bit 5
  ZL = 0x40,        // bit 6
  ZR = 0x80,        // bit 7
  MINUS = 0x100,    // bit 8
  PLUS = 0x200,     // bit 9
  LCLICK = 0x400,   // bit 10
  RCLICK = 0x800,   // bit 11
  HOME = 0x1000,    // bit 12
  CAPTURE = 0x2000, // bit 13
  NONE = 0
};

// Button列挙型のビット演算子定義
inline Button operator|(Button a, Button b) {
  return static_cast<Button>(static_cast<uint16_t>(a) |
                             static_cast<uint16_t>(b));
}
inline Button operator&(Button a, Button b) {
  return static_cast<Button>(static_cast<uint16_t>(a) &
                             static_cast<uint16_t>(b));
}
inline Button &operator|=(Button &a, Button b) {
  a = a | b;
  return a;
}

/**
 * @brief 十字キー(ハットスイッチ)の方向定義
 */
enum class Hat : uint8_t {
  TOP = 0x00,
  TOP_RIGHT = 0x01,
  RIGHT = 0x02,
  BOTTOM_RIGHT = 0x03,
  BOTTOM = 0x04,
  BOTTOM_LEFT = 0x05,
  LEFT = 0x06,
  TOP_LEFT = 0x07,
  CENTER = 0x08
};

/**
 * @brief ESP32-S3をSwitch用USBコントローラーとして動作させるクラス
 */
class SwitchControllerHID : public USBHIDDevice {
public:
  SwitchControllerHID();
  void begin();
  void end();

  // 基本操作
  void press(Button b);              // ボタンを押す
  void release(Button b);            // ボタンを離す
  void setButtonMask(uint16_t mask); // ボタンビットマスクを直接設定
  void releaseAll();                 // すべての入力を初期化

  void setHat(Hat h); // 十字キーを設定

  // スティック操作 (-1.0f 〜 1.0f)
  void setLeftStick(float x, float y);
  void setRightStick(float x, float y);

  // スティック操作 (0 〜 255)
  void setLeftStickRaw(uint8_t x, uint8_t y);
  void setRightStickRaw(uint8_t x, uint8_t y);

  bool send(); // 現在のレポートをUSB経由で送信 (成功したらtrue)

  // USBHIDDevice 継承メソッド (内部用)
  uint16_t _onGetDescriptor(uint8_t *buffer) override;
  uint16_t _onGetReport(uint8_t report_id, uint8_t report_type, uint8_t *buffer,
                        uint16_t len);
  void _onSetReport(uint8_t report_id, uint8_t report_type, uint8_t *buffer,
                    uint16_t len);

private:
  USBHID hid;
  // レポートデータを格納するバッファ (8バイト)
  // Byte 0: Buttons (Low 8 bits)
  // Byte 1: Buttons (High 6 bits) + Padding (2 bits)
  // Byte 2: Hat (Low 4 bits) + Padding (High 4 bits)
  // Byte 3: LX
  // Byte 4: LY
  // Byte 5: RX
  // Byte 6: RY
  // Byte 7: Vendor
  uint8_t _report[8];

  bool _isDirty;
};
