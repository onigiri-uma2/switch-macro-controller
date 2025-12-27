/**
 * Switch Macro Recorder (単体版レコーダー)
 * 目的: Gamepad APIを使用して16ms(60Hz)間隔で入力を記録し、JSON形式で出力する。
 */

class MacroRecorder {
    constructor() {
        this.samplingRate = 16; // ms (約60Hz)
        this.recording = false;
        this.events = [];
        this.startTime = 0;
        this.intervalId = null;
        this.gamepadIndex = null;
        this.waitingForFirstInput = false; // 最初の入力があるまでタイマーを開始しないフラグ

        this.initElements();
        this.bindEvents();
    }

    /**
     * DOM要素の初期化
     */
    initElements() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.gamepadStatus = document.getElementById('gamepadStatus');
        this.gamepadSelect = document.getElementById('gamepadSelect');
        this.recordingStatus = document.getElementById('recordingStatus');
        this.logArea = document.getElementById('log');
    }

    /**
     * イベントリスナーの登録
     */
    bindEvents() {
        let lastGpIds = "";

        // 利用可能なゲームパッドのリストを更新
        const updateGamepadList = () => {
            const gps = navigator.getGamepads();
            const currentGpIds = Array.from(gps).map(g => g ? g.id : "").join("|");

            // 変更があった場合のみリストを再構築 (UI崩れ防止)
            if (currentGpIds !== lastGpIds) {
                const prevValue = this.gamepadSelect.value;
                this.gamepadSelect.innerHTML = '';

                let foundCount = 0;
                for (let i = 0; i < gps.length; i++) {
                    if (gps[i]) {
                        const opt = document.createElement('option');
                        opt.value = i;
                        opt.textContent = gps[i].id;
                        this.gamepadSelect.appendChild(opt);
                        foundCount++;
                    }
                }

                if (foundCount === 0) {
                    const opt = document.createElement('option');
                    opt.value = "";
                    opt.textContent = "コントローラが見つかりません";
                    this.gamepadSelect.appendChild(opt);
                    this.gamepadIndex = null;
                } else {
                    // 以前選択していたものが残っていれば維持
                    if (prevValue !== "" && gps[prevValue]) {
                        this.gamepadSelect.value = prevValue;
                    } else {
                        this.gamepadSelect.selectedIndex = 0;
                    }
                    this.gamepadIndex = parseInt(this.gamepadSelect.value);
                    this.gamepadStatus.textContent = `選択中: ${gps[this.gamepadIndex].id}`;
                }
                lastGpIds = currentGpIds;
            }
        };

        window.addEventListener("gamepadconnected", (e) => {
            this.log(`Gamepad connected: ${e.gamepad.id}`);
            updateGamepadList();
        });

        window.addEventListener("gamepaddisconnected", (e) => {
            this.log(`Gamepad disconnected: ${e.gamepad.id}`);
            updateGamepadList();
        });

        this.gamepadSelect.onchange = () => {
            this.gamepadIndex = this.gamepadSelect.value === "" ? null : parseInt(this.gamepadSelect.value);
            if (this.gamepadIndex !== null) {
                const gp = navigator.getGamepads()[this.gamepadIndex];
                this.gamepadStatus.textContent = `選択中: ${gp.id}`;
            }
        };

        this.startBtn.onclick = () => this.startRecording();
        this.stopBtn.onclick = () => this.stopRecording();
        this.downloadBtn.onclick = () => this.downloadMacro();

        // デバイス検出ポーリング
        setInterval(updateGamepadList, 500);

        // プレビュー用ポーリング (記録中でなくてもボタン反応を確認できるように)
        setInterval(() => {
            if (!this.recording && this.gamepadIndex !== null) {
                this.recordFrame();
            }
        }, 32); // プレビューは30FPS程度で十分
    }

    /**
     * ログ表示エリアにメッセージを出力
     */
    log(msg) {
        const div = document.createElement('div');
        div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        this.logArea.prepend(div);
        if (this.logArea.childNodes.length > 100) this.logArea.lastChild.remove();
    }

    /**
     * 記録開始 (入力待ち状態へ)
     */
    startRecording() {
        if (this.gamepadIndex === null) {
            alert("コントローラが接続されていません。");
            return;
        }
        this.recording = true;
        this.events = [];
        this.startTime = 0;
        this.waitingForFirstInput = true; // 実際の入力があるまでタイマーを回さない
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.downloadBtn.disabled = true;
        this.recordingStatus.textContent = "入力待機中...";
        this.recordingStatus.style.color = "#ffae00";

        this.intervalId = setInterval(() => this.recordFrame(), this.samplingRate);
        this.log("Recording ready - Waiting for input...");
    }

    /**
     * 現在のフレームの状態を読み取る (16msごと)
     */
    recordFrame() {
        const gp = navigator.getGamepads()[this.gamepadIndex];
        if (!gp) return;

        // 1. ボタン状態の取得とHIDビットインデックスへのマッピング
        // Gamepad API Standard: 0:B, 1:A, 2:Y, 3:X ...
        const rawButtons = gp.buttons
            .map((b, i) => (b.pressed ? i : null))
            .filter(i => i !== null);

        const mappedButtons = [];
        rawButtons.forEach(idx => {
            if (idx === 2) mappedButtons.push(0);      // Y -> HID 0
            else if (idx === 0) mappedButtons.push(1); // B -> HID 1
            else if (idx === 1) mappedButtons.push(2); // A -> HID 2
            else if (idx === 3) mappedButtons.push(3); // X -> HID 3
            else if (idx === 4) mappedButtons.push(4); // L
            else if (idx === 5) mappedButtons.push(5); // R
            else if (idx === 6) mappedButtons.push(6); // ZL
            else if (idx === 7) mappedButtons.push(7); // ZR
            else if (idx === 8) mappedButtons.push(8); // -
            else if (idx === 9) mappedButtons.push(9); // +
            else if (idx === 10) mappedButtons.push(10); // LS
            else if (idx === 11) mappedButtons.push(11); // RS
            else if (idx === 16) mappedButtons.push(12); // Home
            else if (idx === 17) mappedButtons.push(13); // Capture
            else if (idx === 12) mappedButtons.push(16); // Up
            else if (idx === 13) mappedButtons.push(17); // Down
            else if (idx === 14) mappedButtons.push(18); // Left
            else if (idx === 15) mappedButtons.push(19); // Right
        });

        // 2. スティック状態の取得
        const axes = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) {
            if (gp.axes[i] !== undefined) {
                let val = gp.axes[i];
                if (Math.abs(val) < 0.2) val = 0; // デッドゾーン処理
                axes[i] = parseFloat(val.toFixed(3));
            }
        }

        const frame = {
            t: this.recording ? Math.round(performance.now() - this.startTime) : 0,
            b: mappedButtons,
            a: axes
        };

        // UI表示用のプレビュー更新
        const statusText = `選択中: ${gp.id} | Buttons: ${mappedButtons.join(',')}`;
        if (this.gamepadStatus.textContent !== statusText) {
            this.gamepadStatus.textContent = statusText;
        }

        // 記録中の場合の保存処理
        if (this.recording) {
            // 初回入力があった時に計測を開始
            if (this.waitingForFirstInput) {
                const isNeutral = mappedButtons.length === 0 && axes.every(v => v === 0);
                if (isNeutral) return;

                this.startTime = performance.now();
                this.waitingForFirstInput = false;
                this.recordingStatus.textContent = "記録中...";
                this.recordingStatus.style.color = "#ff3e3e";
                this.log("First input detected - Timer started");
            }

            // 正確な経過時間を再計算
            frame.t = Math.round(performance.now() - this.startTime);

            // 前回のフレームと変化があった場合のみ保存 (データ圧縮)
            if (this.events.length === 0 || this.isChanged(this.events[this.events.length - 1], frame)) {
                this.events.push(frame);
            }
        }
    }

    /**
     * 前回の状態から変化があったかを判定
     */
    isChanged(prev, curr) {
        if (!prev) return true;
        if (prev.b.length !== curr.b.length) return true;
        if (prev.b.some((val, index) => val !== curr.b[index])) return true;
        // スティックのしきい値(0.05)
        if (prev.a.some((val, index) => Math.abs(val - curr.a[index]) > 0.05)) return true;
        return false;
    }

    /**
     * 記録停止
     */
    stopRecording() {
        this.recording = false;
        clearInterval(this.intervalId);
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.downloadBtn.disabled = false;
        this.recordingStatus.textContent = "記録完了";
        this.recordingStatus.style.color = "#28a745";
        this.log(`Recording stopped. Total events: ${this.events.length}`);
    }

    /**
     * JSONファイルとしてダウンロード
     */
    downloadMacro() {
        const macro = {
            meta: {
                name: "Recorded Macro",
                device: "Switch",
                sampling_rate: this.samplingRate,
                date: new Date().toISOString()
            },
            loop: { enabled: false, count: 0 },
            events: this.events
        };

        const blob = new Blob([JSON.stringify(macro, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `macro_${Date.now()}.json`;
        a.click();
        this.log("Macro downloaded");
    }
}

// アプリケーション起動
window.onload = () => {
    new MacroRecorder();
};
