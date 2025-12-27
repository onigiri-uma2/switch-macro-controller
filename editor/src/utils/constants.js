/**
 * Switch Gamepad 共通定数・マッピング定義
 */

// Switch Pro Controller HID ビットインデックス仕様
export const HID_BUTTONS = {
    Y: 0,
    B: 1,
    A: 2,
    X: 3,
    L: 4,
    R: 5,
    ZL: 6,
    ZR: 7,
    MINUS: 8,
    PLUS: 9,
    LS: 10,
    RS: 11,
    HOME: 12,
    CAPTURE: 13,
    // 十字キー (独自のプロジェクト用定義)
    UP: 16,
    DOWN: 17,
    LEFT: 18,
    RIGHT: 19
};

// タイムライン表示用の順序定義
export const ORDERED_BUTTONS = [
    { label: 'Y', bit: HID_BUTTONS.Y },
    { label: 'B', bit: HID_BUTTONS.B },
    { label: 'A', bit: HID_BUTTONS.A },
    { label: 'X', bit: HID_BUTTONS.X },
    { label: 'L', bit: HID_BUTTONS.L },
    { label: 'R', bit: HID_BUTTONS.R },
    { label: 'ZL', bit: HID_BUTTONS.ZL },
    { label: 'ZR', bit: HID_BUTTONS.ZR },
    { label: '-', bit: HID_BUTTONS.MINUS },
    { label: '+', bit: HID_BUTTONS.PLUS },
    { label: 'LS', bit: HID_BUTTONS.LS },
    { label: 'RS', bit: HID_BUTTONS.RS },
    { label: 'Home', bit: HID_BUTTONS.HOME },
    { label: 'Cap', bit: HID_BUTTONS.CAPTURE },
    { label: 'Up', bit: HID_BUTTONS.UP },
    { label: 'Dn', bit: HID_BUTTONS.DOWN },
    { label: 'Lf', bit: HID_BUTTONS.LEFT },
    { label: 'Rt', bit: HID_BUTTONS.RIGHT }
];

/**
 * Gamepad API (Standard Mapping) のインデックスを Switch HID インデックスに変換する
 */
export const rawToHidIndices = (rawIndices) => {
    const mapped = [];
    rawIndices.forEach(idx => {
        switch (idx) {
            case 2: mapped.push(HID_BUTTONS.Y); break;  // Y
            case 0: mapped.push(HID_BUTTONS.B); break;  // B
            case 1: mapped.push(HID_BUTTONS.A); break;  // A
            case 3: mapped.push(HID_BUTTONS.X); break;  // X
            case 4: mapped.push(HID_BUTTONS.L); break;
            case 5: mapped.push(HID_BUTTONS.R); break;
            case 6: mapped.push(HID_BUTTONS.ZL); break;
            case 7: mapped.push(HID_BUTTONS.ZR); break;
            case 8: mapped.push(HID_BUTTONS.MINUS); break;
            case 9: mapped.push(HID_BUTTONS.PLUS); break;
            case 10: mapped.push(HID_BUTTONS.LS); break;
            case 11: mapped.push(HID_BUTTONS.RS); break;
            case 16: mapped.push(HID_BUTTONS.HOME); break;
            case 17: mapped.push(HID_BUTTONS.CAPTURE); break;
            case 12: mapped.push(HID_BUTTONS.UP); break;
            case 13: mapped.push(HID_BUTTONS.DOWN); break;
            case 14: mapped.push(HID_BUTTONS.LEFT); break;
            case 15: mapped.push(HID_BUTTONS.RIGHT); break;
            default: break;
        }
    });
    return mapped;
};
