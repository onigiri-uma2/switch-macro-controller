import React from 'react';

const GamepadVisualizer = ({ gamepadData }) => {
    if (!gamepadData) return <div style={{ color: '#666' }}>コントローラが接続されていません</div>;

    const { b = [], a = [0, 0, 0, 0] } = gamepadData;
    const isPressed = (index) => b.includes(index);

    // ボタン定義 (Switch Pro Controller HID ビット順)
    const faceButtons = [
        { label: 'Y', idx: 0, bottom: '105px', right: '65px' },
        { label: 'B', idx: 1, bottom: '85px', right: '40px' },
        { label: 'A', idx: 2, bottom: '105px', right: '15px' },
        { label: 'X', idx: 3, bottom: '125px', right: '40px' },
    ];

    const dpadButtons = [
        { label: '▲', idx: 16, top: '95px', left: '40px' },
        { label: '▼', idx: 17, top: '135px', left: '40px' },
        { label: '◀', idx: 18, top: '115px', left: '20px' },
        { label: '▶', idx: 19, top: '115px', left: '60px' },
    ];

    const centerButtons = [
        { label: '-', idx: 8, top: '35px', left: '38%' },
        { label: '+', idx: 9, top: '35px', right: '38%' },
        { label: 'C', idx: 13, top: '70px', left: '41%', size: '14px' },
        { label: 'H', idx: 12, top: '70px', right: '41%', size: '16px' },
    ];

    return (
        <div className="gamepad-visualizer" style={{
            position: 'relative',
            width: '320px',
            height: '200px',
            background: '#2d2d2d',
            borderRadius: '40px',
            margin: '20px auto',
            border: '2px solid #444',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}>
            {/* L/R, ZL/ZR */}
            <div style={{ position: 'absolute', top: '-10px', width: '100%', display: 'flex', justifyContent: 'space-between', padding: '0 30px 0 20px', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', gap: '5px' }}>
                    <div style={{ background: isPressed(6) ? '#ff4646' : '#1a1a1a', padding: '2px 10px', borderRadius: '4px', fontSize: '10px', border: '1px solid #555' }}>ZL</div>
                    <div style={{ background: isPressed(4) ? '#646cff' : '#1a1a1a', padding: '2px 10px', borderRadius: '4px', fontSize: '10px', border: '1px solid #555' }}>L</div>
                </div>
                <div style={{ display: 'flex', gap: '5px' }}>
                    <div style={{ background: isPressed(5) ? '#646cff' : '#1a1a1a', padding: '2px 10px', borderRadius: '4px', fontSize: '10px', border: '1px solid #555' }}>R</div>
                    <div style={{ background: isPressed(7) ? '#ff4646' : '#1a1a1a', padding: '2px 10px', borderRadius: '4px', fontSize: '10px', border: '1px solid #555' }}>ZR</div>
                </div>
            </div>

            {/* Left Stick */}
            <div style={{
                position: 'absolute',
                top: '40px',
                left: '70px',
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: '#1a1a1a',
                border: isPressed(10) ? '2px solid #646cff' : '1px solid #444',
                boxSizing: 'border-box'
            }}>
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: '#333',
                    transform: `translate(calc(-50% + ${a[0] * 8}px), calc(-50% + ${a[1] * 8}px))`,
                    border: '2px solid #646cff',
                    boxSizing: 'border-box'
                }} />
            </div>

            {/* Right Stick */}
            <div style={{
                position: 'absolute',
                bottom: '40px',
                right: '80px',
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: '#1a1a1a',
                border: isPressed(11) ? '2px solid #646cff' : '1px solid #444',
                boxSizing: 'border-box'
            }}>
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: '#333',
                    transform: `translate(calc(-50% + ${a[2] * 8}px), calc(-50% + ${a[3] * 8}px))`,
                    border: '2px solid #646cff',
                    boxSizing: 'border-box'
                }} />
            </div>

            {/* ABXY */}
            {faceButtons.map(btn => (
                <div key={btn.idx} style={{
                    position: 'absolute',
                    bottom: btn.bottom,
                    right: btn.right,
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: isPressed(btn.idx) ? '#646cff' : '#1a1a1a',
                    color: 'white',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #555',
                    fontWeight: 'bold'
                }}>{btn.label}</div>
            ))}

            {/* D-Pad */}
            {dpadButtons.map(btn => (
                <div key={btn.idx} style={{
                    position: 'absolute',
                    top: btn.top,
                    left: btn.left,
                    width: '20px',
                    height: '20px',
                    background: isPressed(btn.idx) ? '#646cff' : '#1a1a1a',
                    color: 'white',
                    fontSize: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #555'
                }}>{btn.label}</div>
            ))}

            {/* Center Buttons (+, -, Home, Capture) */}
            {centerButtons.map(btn => (
                <div key={btn.idx} style={{
                    position: 'absolute',
                    top: btn.top,
                    bottom: btn.bottom,
                    left: btn.left,
                    right: btn.right,
                    width: btn.size || '14px',
                    height: btn.size || '14px',
                    background: isPressed(btn.idx) ? '#646cff' : '#1a1a1a',
                    color: 'white',
                    fontSize: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #555',
                    borderRadius: btn.label === 'H' ? '50%' : '2px'
                }}>{btn.label}</div>
            ))}
        </div>
    );
};

export default GamepadVisualizer;
