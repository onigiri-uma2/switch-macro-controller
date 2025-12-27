import React, { useState, useEffect } from 'react';
import { ORDERED_BUTTONS } from '../utils/constants';

/**
 * マクロのタイムライン編集用コンポーネント
 */
const TimelineEditor = ({ macro, setMacro }) => {
    const [editingIndex, setEditingIndex] = useState(null); // 現在編集中のイベントのインデックス
    const [editValues, setEditValues] = useState(null);    // 編集中の入力値のバッファ
    const macroRef = React.useRef(macro);                   // 最新のマクロ状態を保持するRef

    // リクローズ対策: 常に最新のmacroをRefに保存しておく
    useEffect(() => {
        macroRef.current = macro;
    }, [macro]);


    /**
     * 編集モードを開始する
     * @param {number} index 指定したイベントのインデックス
     * @param {object} currentMacro 最新のマクロデータ (省略時はstateを使用)
     */
    const handleEdit = (index, currentMacro = null) => {
        const targetMacro = currentMacro || macro;
        setEditingIndex(index);
        const event = targetMacro.events[index];
        const prevTime = index > 0 ? targetMacro.events[index - 1].t : 0;

        // 編集用の一時的な状態を作成
        setEditValues({
            ...event,
            deltaTime: event.t - prevTime // フロントエンドでの調整用に差分時間を算出
        });
    };

    /**
     * 変更を保存し、タイムライン全体をシフト(リップル編集)する
     */
    const handleSave = () => {
        if (editingIndex === null || !editValues) return;

        const newEvents = [...macro.events];
        const oldEvent = newEvents[editingIndex];

        // 1. 差分時間(Delta Time)の変化から全体のシフト量を計算
        const prevTime = editingIndex > 0 ? newEvents[editingIndex - 1].t : 0;
        const newTime = prevTime + parseInt(editValues.deltaTime);
        const timeDiff = newTime - oldEvent.t;

        // 2. 現在のイベントに値を反映
        newEvents[editingIndex] = {
            t: newTime,
            b: editValues.b,
            a: editValues.a.map(v => parseFloat(v)) // 数値として保存
        };

        // 3. 以降のイベントをすべて時間シフト (リップル編集)
        if (timeDiff !== 0) {
            for (let i = editingIndex + 1; i < newEvents.length; i++) {
                newEvents[i].t += timeDiff;
            }
        }

        setMacro(prev => ({ ...prev, events: newEvents }));
        setEditingIndex(null);
        setEditValues(null);
    };

    /**
     * イベントを削除する
     */
    const handleDelete = (index) => {
        if (!window.confirm("このイベントを削除しますか？")) return;
        const newEvents = macro.events.filter((_, i) => i !== index);
        setMacro(prev => ({ ...prev, events: newEvents }));
    };

    /**
     * 指定した場所の直後に新しいイベントを挿入する
     */
    const handleAdd = (index) => {
        const newEvents = [...macro.events];
        const baseEvent = newEvents[index];

        // 次のイベントとの中間時間に作成、なければ500ms後
        const nextTime = (index + 1 < newEvents.length) ? newEvents[index + 1].t : baseEvent.t + 500;

        const newEvent = {
            t: Math.floor((baseEvent.t + nextTime) / 2),
            b: [],
            a: [0, 0, 0, 0]
        };

        newEvents.splice(index + 1, 0, newEvent);
        setMacro(prev => ({ ...prev, events: newEvents }));

        // 挿入後、即座に編集モードへ移行 (setTimeoutで最新State反映を待つ)
        setTimeout(() => {
            handleEdit(index + 1, macroRef.current);
        }, 50);
    };

    /**
     * 編集中のボタンON/OFFを切り替える
     */
    const toggleButton = (bit) => {
        const currentButtons = editValues.b;
        const index = currentButtons.indexOf(bit);
        let newButtons;
        if (index === -1) {
            newButtons = [...currentButtons, bit];
        } else {
            newButtons = currentButtons.filter(b => b !== bit);
        }
        setEditValues({ ...editValues, b: newButtons });
    };

    /**
     * 編集中のスティック軸を更新する
     */
    const updateAxis = (axisIndex, val) => {
        let numericVal = parseFloat(val);
        if (isNaN(numericVal)) numericVal = 0;

        // -1.0 〜 1.0 の範囲にクランプし、小数点第3位に丸める
        const clampedVal = Math.round(Math.max(-1.0, Math.min(1.0, numericVal)) * 1000) / 1000;

        const newAxes = [...editValues.a];
        newAxes[axisIndex] = clampedVal;
        setEditValues({ ...editValues, a: newAxes });
    };

    return (
        <div className="timeline-editor">
            <div className="timeline-header">
                <span>時間 (差分)</span>
                <span>ボタン</span>
                <span>左スティック</span>
                <span>右スティック</span>
                <span>操作</span>
            </div>
            <div className="timeline-list">
                {macro.events.map((ev, idx) => {
                    const isEditing = editingIndex === idx;
                    const prevTime = idx > 0 ? macro.events[idx - 1].t : 0;
                    const deltaTime = ev.t - prevTime;

                    if (isEditing) {
                        return (
                            <div key={idx} className="timeline-row editing">
                                <div className="edit-time-group">
                                    <label>絶対時間: {ev.t}ms</label>
                                    <div className="delta-input">
                                        <span>前からの差: +</span>
                                        <input
                                            type="number"
                                            value={editValues.deltaTime}
                                            onChange={(e) => setEditValues({ ...editValues, deltaTime: parseInt(e.target.value) || 0 })}
                                            style={{ width: '60px' }}
                                        /> ms
                                    </div>
                                </div>
                                <div className="edit-buttons-group">
                                    {ORDERED_BUTTONS.map(btn => (
                                        <button
                                            key={btn.bit}
                                            className={`btn-toggle ${editValues.b.includes(btn.bit) ? 'active' : ''}`}
                                            onClick={() => toggleButton(btn.bit)}
                                            title={btn.label}
                                        >
                                            {btn.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="edit-stick-group">
                                    <label>L</label>
                                    <input type="number" step="0.001" min="-1" max="1" value={editValues.a[0]} onChange={e => updateAxis(0, e.target.value)} />
                                    <input type="number" step="0.001" min="-1" max="1" value={editValues.a[1]} onChange={e => updateAxis(1, e.target.value)} />
                                </div>
                                <div className="edit-stick-group">
                                    <label>R</label>
                                    <input type="number" step="0.001" min="-1" max="1" value={editValues.a[2]} onChange={e => updateAxis(2, e.target.value)} />
                                    <input type="number" step="0.001" min="-1" max="1" value={editValues.a[3]} onChange={e => updateAxis(3, e.target.value)} />
                                </div>
                                <div className="edit-actions">
                                    <button className="accent-button" onClick={handleSave}>保存</button>
                                    <button onClick={() => setEditingIndex(null)}>キャンセル</button>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={idx} className="timeline-row" onClick={() => handleEdit(idx)}>
                            <div className="time-col">
                                <span className="abs-time">{ev.t}ms</span>
                                <span className="delta-time">(+{deltaTime})</span>
                            </div>
                            <div className="buttons-col">
                                {ev.b.length > 0 ? ev.b.map(b => ORDERED_BUTTONS.find(ob => ob.bit === b)?.label).join(' ') : '-'}
                            </div>
                            <div className="stick-col">
                                L: {ev.a[0].toFixed(3)}, {ev.a[1].toFixed(3)}
                            </div>
                            <div className="stick-col">
                                R: {ev.a[2].toFixed(3)}, {ev.a[3].toFixed(3)}
                            </div>
                            <div className="row-actions">
                                <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleDelete(idx); }} title="削除">🗑️</button>
                                <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleAdd(idx); }} title="次に挿入">➕</button>
                            </div>
                        </div>
                    );
                })}
                {macro.events.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>イベントがありません。上のボタンで記録するか、下の「＋」で手動追加してください。</div>}
                <div style={{ textAlign: 'center', padding: '10px' }}>
                    <button onClick={() => {
                        const lastTime = macro.events.length > 0 ? macro.events[macro.events.length - 1].t : 0;
                        setMacro(prev => ({ ...prev, events: [...prev.events, { t: lastTime + 500, b: [], a: [0, 0, 0, 0] }] }))
                    }}>＋ 末尾に新規追加</button>
                </div>
            </div>
        </div>
    );
};

export default TimelineEditor;
