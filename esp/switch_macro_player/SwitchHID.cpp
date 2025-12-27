#include "SwitchHID.h"

// Switch Pro Controller HID レポート記述子
// Switch本体が「Pro Controller」として認識するために必要なデータ構造の定義
// Switch Pro Controller HID レポート記述子 (Based on SwitchControlLibrary)
static const uint8_t _hidReportDescriptor[] = {
    0x05, 0x01,       //   USAGE_PAGE (Generic Desktop)
    0x09, 0x05,       //   USAGE (Game Pad)
    0xa1, 0x01,       //   COLLECTION (Application)
    0x15, 0x00,       //   LOGICAL_MINIMUM (0)
    0x25, 0x01,       //   LOGICAL_MAXIMUM (1)
    0x35, 0x00,       //   PHYSICAL_MINIMUM (0)
    0x45, 0x01,       //   PHYSICAL_MAXIMUM (1)
    0x75, 0x01,       //   REPORT_SIZE (1)
    0x95, 0x10,       //   REPORT_COUNT (16)
    0x05, 0x09,       //   USAGE_PAGE (Button)
    0x19, 0x01,       //   USAGE_MINIMUM (1)
    0x29, 0x10,       //   USAGE_MAXIMUM (16)
    0x81, 0x02,       //   INPUT (Data,Var,Abs)
    0x05, 0x01,       //   USAGE_PAGE (Generic Desktop)
    0x25, 0x07,       //   LOGICAL_MAXIMUM (7)
    0x46, 0x3b, 0x01, //   PHYSICAL_MAXIMUM (315)
    0x75, 0x04,       //   REPORT_SIZE (4)
    0x95, 0x01,       //   REPORT_COUNT (1)
    0x65, 0x14,       //   UNIT (20)
    0x09, 0x39,       //   USAGE (Hat Switch)
    0x81, 0x42,       //   INPUT (Data,Var,Abs,Null State)
    0x65, 0x00,       //   UNIT (0)
    0x95, 0x01,       //   REPORT_COUNT (1)
    0x81, 0x01,       //   INPUT (Cnst,Arr,Abs)
    0x26, 0xff, 0x00, //   LOGICAL_MAXIMUM (255)
    0x46, 0xff, 0x00, //   PHYSICAL_MAXIMUM (255)
    0x09, 0x30,       //   USAGE (X)
    0x09, 0x31,       //   USAGE (Y)
    0x09, 0x32,       //   USAGE (Z)
    0x09, 0x35,       //   USAGE (Rz)
    0x75, 0x08,       //   REPORT_SIZE (8)
    0x95, 0x04,       //   REPORT_COUNT (4)
    0x81, 0x02,       //   INPUT (Data,Var,Abs)
    0x06, 0x00, 0xff, //   USAGE_PAGE (Vendor Defined 65280)
    0x09, 0x20,       //   USAGE (32)
    0x95, 0x01,       //   REPORT_COUNT (1)
    0x81, 0x02,       //   INPUT (Data,Var,Abs)
    0x0a, 0x21, 0x26, //   USAGE (9761)
    0x95, 0x08,       //   REPORT_COUNT (8)
    0x91, 0x02,       //   OUTPUT (Data,Var,Abs)
    0xc0              // END_COLLECTION
};

SwitchControllerHID::SwitchControllerHID() {
  releaseAll(); // 初期化を共通化
  _isDirty = false;
}

void SwitchControllerHID::begin() {
  hid.addDevice(this, sizeof(_hidReportDescriptor));
  hid.begin();
}

void SwitchControllerHID::end() {}

void SwitchControllerHID::press(Button b) {
  uint16_t mask = static_cast<uint16_t>(b);
  _report[0] |= (mask & 0xFF);
  _report[1] |= ((mask >> 8) & 0x3F); // 上位6bitのみ有効 (残り2bitはパディング)
}

void SwitchControllerHID::setButtonMask(uint16_t mask) {
  _report[0] = (mask & 0xFF);
  _report[1] = ((mask >> 8) & 0x3F);
}

void SwitchControllerHID::release(Button b) {
  uint16_t mask = static_cast<uint16_t>(b);
  _report[0] &= ~(mask & 0xFF);
  _report[1] &= ~((mask >> 8) & 0x3F);
}

void SwitchControllerHID::releaseAll() {
  memset(_report, 0, sizeof(_report));
  _report[2] = 0x08; // Hat center (0x08)
  _report[3] = 128;  // LX
  _report[4] = 128;  // LY
  _report[5] = 128;  // RX
  _report[6] = 128;  // RY
  _report[7] = 0;    // Vendor
}

void SwitchControllerHID::setHat(Hat h) {
  // Hat is low 4 bits of Byte 2. High 4 bits are padding (0)
  _report[2] = static_cast<uint8_t>(h) & 0x0F;
}

/**
 * 左スティックの値を設定 (-1.0 〜 1.0)
 */
void SwitchControllerHID::setLeftStick(float x, float y) {
  // constrainを手動実装 (ライブラリ依存回避)
  if (x < -1.0f)
    x = -1.0f;
  if (x > 1.0f)
    x = 1.0f;
  if (y < -1.0f)
    y = -1.0f;
  if (y > 1.0f)
    y = 1.0f;

  _report[3] = static_cast<uint8_t>((x + 1.0f) * 127.5f);
  _report[4] = static_cast<uint8_t>((y + 1.0f) * 127.5f);
}

/**
 * 右スティックの値を設定 (-1.0 〜 1.0)
 */
void SwitchControllerHID::setRightStick(float x, float y) {
  if (x < -1.0f)
    x = -1.0f;
  if (x > 1.0f)
    x = 1.0f;
  if (y < -1.0f)
    y = -1.0f;
  if (y > 1.0f)
    y = 1.0f;

  _report[5] = static_cast<uint8_t>((x + 1.0f) * 127.5f);
  _report[6] = static_cast<uint8_t>((y + 1.0f) * 127.5f);
}

void SwitchControllerHID::setLeftStickRaw(uint8_t x, uint8_t y) {
  _report[3] = x;
  _report[4] = y;
}

void SwitchControllerHID::setRightStickRaw(uint8_t x, uint8_t y) {
  _report[5] = x;
  _report[6] = y;
}

bool SwitchControllerHID::send() {
  if (hid.ready()) {
    return hid.SendReport(0, _report, sizeof(_report));
  }
  return false;
}

// USBHIDからの要求に応答する記述子取得関数
uint16_t SwitchControllerHID::_onGetDescriptor(uint8_t *buffer) {
  memcpy(buffer, _hidReportDescriptor, sizeof(_hidReportDescriptor));
  return sizeof(_hidReportDescriptor);
}

uint16_t SwitchControllerHID::_onGetReport(uint8_t report_id,
                                           uint8_t report_type, uint8_t *buffer,
                                           uint16_t len) {
  return 0;
}

void SwitchControllerHID::_onSetReport(uint8_t report_id, uint8_t report_type,
                                       uint8_t *buffer, uint16_t len) {}
