/**
 * Web Bluetoothを使用したESP32へのマクロ転送クラス
 * 目的: MTU制限を考慮し、データをチャンク分割して送信する。
 */
export class BLETransfer {
    constructor() {
        this.device = null;
        this.characteristic = null;
        this.SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E".toLowerCase(); // Nordic UART Service
        this.RX_CHAR_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E".toLowerCase(); // RX Characteristic
        this.CHUNK_SIZE = 128; // ESP32 NimBLEのバッファサイズに合わせて調整
    }

    async connect() {
        const tryGattConnect = async (device) => {
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(this.SERVICE_UUID);
            this.characteristic = await service.getCharacteristic(this.RX_CHAR_UUID);
            this.device = device;
            this.device.addEventListener('gattserverdisconnected', () => {
                console.log("BLE Device disconnected");
                this.characteristic = null;
            });
            return true;
        };

        try {
            // 1. 自動再接続の試行
            if (navigator.bluetooth.getDevices) {
                const devices = await navigator.bluetooth.getDevices();
                const authorizedDevice = devices.find(d => d.name && d.name.startsWith('ATOMS3-Macro'));
                if (authorizedDevice) {
                    console.log("Attempting auto-connect to:", authorizedDevice.name);
                    try {
                        await tryGattConnect(authorizedDevice);
                        return true;
                    } catch (e) {
                        console.warn("Auto-connect failed, falling back to chooser:", e);
                        this.device = null;
                        this.characteristic = null;
                    }
                }
            }

            // 2. 自動接続できない、または失敗した場合はダイアログを表示
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'ATOMS3-Macro' },
                    { services: [this.SERVICE_UUID] }
                ],
                optionalServices: [this.SERVICE_UUID]
            });

            await tryGattConnect(this.device);
            console.log("Connected to BLE device");
            return true;
        } catch (error) {
            this.device = null;
            this.characteristic = null;
            console.error("BLE Connection failed", error);
            if (error.name === 'NotFoundError') {
                throw new Error("デバイスが見つからないか、選択がキャンセルされました。");
            }
            throw error;
        }
    }

    async sendMacro(macroJson, onProgress) {
        if (!this.characteristic) throw new Error("Not connected");

        const data = JSON.stringify(macroJson);
        const encoder = new TextEncoder();
        const bytes = encoder.encode(data);
        const totalChunks = Math.ceil(bytes.length / this.CHUNK_SIZE);

        console.log(`Sending ${bytes.length} bytes in ${totalChunks} chunks`);

        // ヘッダー送信 (START:TotalSize:CRC)
        const header = `START:${bytes.length}`;
        await this.characteristic.writeValue(encoder.encode(header));
        await new Promise(r => setTimeout(r, 100)); // 少し待機

        for (let i = 0; i < totalChunks; i++) {
            const start = i * this.CHUNK_SIZE;
            const end = Math.min(start + this.CHUNK_SIZE, bytes.length);
            const chunk = bytes.slice(start, end);

            await this.characteristic.writeValue(chunk);

            if (onProgress) {
                onProgress(Math.round(((i + 1) / totalChunks) * 100));
            }

            // ESP32側の処理時間を考慮して少しディレイを入れる (FLOW CONTROL)
            await new Promise(r => setTimeout(r, 50));
        }

        // 終了通知
        await this.characteristic.writeValue(encoder.encode("END"));
        console.log("Transfer complete");
    }

    async sendLiveFrame(payload) {
        if (!this.characteristic) return;
        try {
            const encoder = new TextEncoder();
            // writeValueWithoutResponse を使用して確認応答を待たずに送信 (低遅延)
            await this.characteristic.writeValueWithoutResponse(encoder.encode(payload));
        } catch (e) {
            console.error("Live send failed", e);
        }
    }

    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
    }
}
