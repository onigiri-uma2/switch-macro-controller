import React, { useState, useEffect, useRef } from 'react';
import { BLETransfer } from './utils/ble_transfer';
import GamepadVisualizer from './components/GamepadVisualizer';
import TimelineEditor from './components/TimelineEditor';
import './index.css';
import { rawToHidIndices as convertRawToHid } from './utils/constants';

// Web Bluetooth通信用のインスタンス
const ble = new BLETransfer();

function App() {
    // --- 状態管理 (State) ---
    const [macro, setMacro] = useState({
        meta: { name: "New Macro", author: "User", version: "1.0", sampling_rate: 16 },
        loop: { enabled: false, count: 0 },
        events: []
    });
    const [status, setStatus] = useState('ATOMS3に接続してください');
    const [gamepadStatus, setGamepadStatus] = useState('コントローラを接続し、ボタンを押してください');
    const [gamepads, setGamepads] = useState([]);
    const [selectedGamepadIndex, setSelectedGamepadIndex] = useState(null);
    const [progress, setProgress] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(null); // 現在のコントローラ入力を保持 (可視化用)

    // --- インターバル・フラグ管理 (Ref) ---
    const recordInterval = useRef(null);
    const discoveryInterval = useRef(null);
    const selectedIndexRef = useRef(null);
    const isRecordingRef = useRef(false);
    const waitingForInputRef = useRef(false);
    const startTime = useRef(0);
    const lastState = useRef(null); // 前回の入力状態 (変化検知用)

    // 選択中のゲームパッドインデックスをRefに同期 (setInterval内での最新値参照用)
    useEffect(() => {
        selectedIndexRef.current = selectedGamepadIndex;
    }, [selectedGamepadIndex]);

    /**
     * ATOMS3デバイスへ接続を開始する
     */
    const connectDevice = async () => {
        try {
            setStatus('接続中...');
            await ble.connect();
            setIsConnected(true);
            setStatus('ATOMS3接続済み');
            setGamepadStatus('コントローラを認識中... ボタンを押してください');
        } catch (err) {
            setIsConnected(false);
            if (err.message.includes("cancelled") || err.message.includes("見つからない")) {
                setStatus('接続失敗: デバイスが選択されませんでした。');
                setGamepadStatus('ヒント: すでにOS側で接続されているとリストに表示されない場合があります。Windowsの設定からATOMS3のペアリングを一度解除してからやり直してください。');
            } else {
                setStatus('接続失敗: ' + err.message);
            }
        }
    };

    /**
     * 接続されているゲームパッドのリストを更新する
     */
    const updateGamepadList = () => {
        const gps = navigator.getGamepads();
        const activeGps = [];
        let foundSelected = false;

        for (let i = 0; i < gps.length; i++) {
            if (gps[i]) {
                activeGps.push({ index: i, id: gps[i].id });
                if (selectedGamepadIndex === i) foundSelected = true;
            }
        }

        setGamepads(activeGps);

        // デバイスが接続された際に、未選択なら先頭を選択
        if (activeGps.length > 0) {
            if (selectedGamepadIndex === null || !foundSelected) {
                setSelectedGamepadIndex(activeGps[0].index);
            }
        } else {
            setSelectedGamepadIndex(null);
        }
    };

    // ゲームパッド接続/切断イベントの監視
    useEffect(() => {
        window.addEventListener("gamepadconnected", updateGamepadList);
        window.addEventListener("gamepaddisconnected", updateGamepadList);

        // 一部の環境でイベントが発火しないため、定期的にも確認する
        discoveryInterval.current = setInterval(updateGamepadList, 500);

        return () => {
            window.removeEventListener("gamepadconnected", updateGamepadList);
            window.removeEventListener("gamepaddisconnected", updateGamepadList);
            clearInterval(discoveryInterval.current);
        };
    }, [selectedGamepadIndex]);

    // インデックス変更時にポーリングを開始/停止
    useEffect(() => {
        stopPolling();
        if (selectedGamepadIndex !== null) {
            startPolling();
        }
    }, [selectedGamepadIndex]);


    /**
     * 60Hzでのコントローラ入力監視を開始する
     */
    const startPolling = () => {
        if (recordInterval.current) return;
        recordInterval.current = setInterval(async () => {
            const gps = navigator.getGamepads();
            const gp = gps[selectedIndexRef.current];
            if (!gp) return;

            // ボタン状態の取得とHID変換
            const rawB = gp.buttons.map((btn, i) => btn.pressed ? i : null).filter(i => i !== null);
            const b = convertRawToHid(rawB);

            // スティック状態の取得
            const a = [0, 0, 0, 0];
            for (let i = 0; i < 4; i++) {
                if (gp.axes[i] !== undefined) {
                    let val = gp.axes[i];
                    if (Math.abs(val) < 0.2) val = 0; // デッドゾーン処理
                    a[i] = parseFloat(val.toFixed(3));
                }
            }
            const frame = { t: 0, b, a };
            setCurrentFrame(frame); // プレビュー等に反映

            // 記録中の場合はマクロとして保存
            if (isRecordingRef.current) {
                processRecording(gp, b, a);
            }
        }, 16); // ~60FPS
    };

    const stopPolling = () => {
        clearInterval(recordInterval.current);
        recordInterval.current = null;
    };

    /**
     * 入力イベントをマクロタイムラインに記録する
     */
    const processRecording = async (gp, b, a) => {
        if (waitingForInputRef.current) {
            // 入力待機中: 何かしらの入力（ボタン or スティック）があるまで開始しない
            const isNeutral = b.length === 0 && a.every(v => v === 0);
            if (isNeutral) return;

            // 入力検知: 記録開始
            startTime.current = performance.now();
            waitingForInputRef.current = false;
            setStatus('記録中...');
            console.log("First input detected - Timer started");
        }

        // HID用のビットマスクを生成
        let hidMask = 0;
        b.forEach(idx => {
            if (idx < 20) hidMask |= (1 << idx);
        });

        const lx = Math.round(a[0] * 127);
        const ly = Math.round(a[1] * 127);
        const rx = Math.round(a[2] * 127);
        const ry = Math.round(a[3] * 127);

        // 前回から入力が変化したかチェック
        const currentState = { hidMask, a: [lx, ly, rx, ry] };
        if (!lastState.current || isChanged(lastState.current, currentState)) {
            lastState.current = currentState;
            const time = Math.round(performance.now() - startTime.current);

            // マクロに追加
            setMacro(prev => ({
                ...prev,
                events: [...prev.events, {
                    t: time,
                    b: [...b],
                    a: a.map(v => Math.round(v * 100) / 100)
                }]
            }));

            // ATOMS3にリアルタイム中継 (Live Bridge)
            if (isConnected) {
                const payload = `L:${hidMask}:${lx}:${ly}:${rx}:${ry}`;
                await ble.sendLiveFrame(payload);
            }
        }
    };

    // 記録開始
    const startLiveRecord = () => {
        setIsRecording(true);
        isRecordingRef.current = true;
        waitingForInputRef.current = true;
        startTime.current = 0;
        setMacro(prev => ({ ...prev, events: [] }));
        lastState.current = null;
    };

    // 記録停止
    const stopLiveRecord = () => {
        setIsRecording(false);
        isRecordingRef.current = false;
    };

    /**
     * 前回の状態から変化があったかを判定する
     */
    const isChanged = (prev, curr) => {
        if (!prev) return true;
        if (prev.hidMask !== curr.hidMask) return true;
        // スティックの遊び（ノイズ）を無視するためのしきい値(0.05)
        if (prev.a.some((v, i) => Math.abs(v - curr.a[i]) > 0.05)) return true;
        return false;
    };

    /**
     * マクロデータをJSONファイルとしてダウンロードする
     */
    const downloadMacro = () => {
        const blob = new Blob([JSON.stringify(macro, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `macro_${Date.now()}.json`;
        a.click();
    };

    /**
     * 現在のマクロをBLE経由でATOMS3に転送する
     */
    const transferToESP = async () => {
        if (!isConnected) {
            alert("先にATOMS3に接続してください");
            return;
        }
        try {
            setStatus('転送中... (ATOMS3のLEDが緑色に点灯するまで待ってください)');
            await ble.sendMacro(macro, (p) => setProgress(p));
            setStatus('転送完了！ ATOMS3のボタンAで再生できます');
            setProgress(0);
        } catch (err) {
            setStatus('転送失敗: ' + err.message);
        }
    };

    /**
     * ローカルのJSONファイルをマクロとして読み込む
     */
    const importMacro = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.events) {
                    setMacro(data);
                    setStatus('マクロファイルを読み込みました');
                } else {
                    alert('無効な形式です: eventsが見つかりません');
                }
            } catch (err) {
                alert('JSONパースエラー: ' + err.message);
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="App">
            <h1>Switch Macro Live Editor</h1>

            <div className="toolbar">
                <button onClick={connectDevice} disabled={isConnected} className={isConnected ? "" : "accent-button"}>
                    {isConnected ? "ATOMS3接続済み" : "ATOMS3に接続"}
                </button>

                {!isRecording ? (
                    <button onClick={startLiveRecord} className="accent-button">
                        記録開始 (コントローラ入力待ち)
                    </button>
                ) : (
                    <button onClick={stopLiveRecord} className="danger-button">
                        記録停止
                    </button>
                )}

                <button onClick={downloadMacro} disabled={macro.events.length === 0}>
                    ファイルを保存
                </button>

                <div style={{ position: 'relative' }}>
                    <button className="accent-button" onClick={() => document.getElementById('macro-import').click()}>
                        ファイルを開く
                    </button>
                    <input
                        id="macro-import"
                        type="file"
                        accept=".json"
                        onChange={importMacro}
                        style={{ display: 'none' }}
                    />
                </div>

                <button onClick={transferToESP} disabled={!isConnected || macro.events.length === 0} className={isConnected && macro.events.length > 0 ? "accent-button" : ""}>
                    ATOMS3に転送
                </button>
            </div>

            <div className="loop-settings">
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>ループ再生設定:</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <input
                        type="checkbox"
                        checked={macro.loop?.enabled || false}
                        onChange={(e) => setMacro(prev => ({ ...prev, loop: { ...prev.loop, enabled: e.target.checked } }))}
                    />
                    有効にする
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    回数:
                    <input
                        type="number"
                        min="0"
                        placeholder="0=無限"
                        value={macro.loop?.count}
                        onChange={(e) => setMacro(prev => ({ ...prev, loop: { ...prev.loop, count: parseInt(e.target.value) || 0 } }))}
                        disabled={!macro.loop?.enabled}
                        style={{ width: '60px', padding: '4px', background: '#222', color: 'white', border: '1px solid #555' }}
                    />
                    <span style={{ fontSize: '11px', color: '#aaa' }}>(0で無限)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    間隔:
                    <input
                        type="number"
                        min="0"
                        value={macro.loop?.interval}
                        onChange={(e) => setMacro(prev => ({ ...prev, loop: { ...prev.loop, interval: parseInt(e.target.value) || 0 } }))}
                        disabled={!macro.loop?.enabled}
                        style={{ width: '60px', padding: '4px', background: '#222', color: 'white', border: '1px solid #555' }}
                    />
                    秒
                </label>
            </div>

            <div className="status-bar" style={{ color: isRecording ? '#ff4646' : '#aaa' }}>
                {isRecording ? (waitingForInputRef.current ? "● 記録準備完了 - ボタンを押すと開始します" : "● 記録中...") : status}
            </div>

            <div className="main-container">
                <div className="control-panel">
                    <h3>コントローラ監視</h3>
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>入力デバイス:</label>
                        <select
                            value={selectedGamepadIndex || ''}
                            onChange={(e) => setSelectedGamepadIndex(Number(e.target.value))}
                            style={{ width: '100%', padding: '8px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px' }}
                        >
                            {gamepads.length === 0 && <option value="">デバイスが見つかりません</option>}
                            {gamepads.map(gp => (
                                <option key={gp.index} value={gp.index}>{gp.id}</option>
                            ))}
                        </select>
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '5px' }}>
                            ※表示されない場合はコントローラのボタンを押してください
                        </div>
                    </div>
                    <GamepadVisualizer gamepadData={currentFrame} />
                </div>

                <div className="editor-container timeline-container">
                    <h3>タイムライン ({macro.events.length} イベント)</h3>
                    <TimelineEditor macro={macro} setMacro={setMacro} />
                </div>
            </div>
        </div >
    );
}

export default App;
