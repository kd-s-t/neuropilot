import 'dart:async';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

const String museServiceUuid = '0000fe8d-0000-1000-8000-00805f9b34fb';
const String streamToggleUuid = '273e0001-4c4d-454d-96be-f03bac821358';
const String tp9Uuid = '273e0003-4c4d-454d-96be-f03bac821358';
const String af7Uuid = '273e0004-4c4d-454d-96be-f03bac821358';
const String af8Uuid = '273e0005-4c4d-454d-96be-f03bac821358';
const String tp10Uuid = '273e0006-4c4d-454d-96be-f03bac821358';
const String rightAuxUuid = '273e0007-4c4d-454d-96be-f03bac821358';

const List<String> eegCharacteristicUuids = [tp9Uuid, af7Uuid, af8Uuid, tp10Uuid];

const double _scale12BitToMicrovolts = 0.48828125;
const int _eegPacketPayloadBytes = 20;

bool isMuseDevice(ScanResult r) {
  final name = r.device.platformName;
  return name.isNotEmpty && name.toLowerCase().contains('muse');
}

List<int> museStartStreamCommand() {
  const cmd = 'd';
  return [cmd.length + 1, ...cmd.codeUnits, 0x0a];
}

List<int> museStopStreamCommand() {
  const cmd = 'h';
  return [cmd.length + 1, ...cmd.codeUnits, 0x0a];
}

List<int> museKeepAliveCommand() {
  const cmd = 'k';
  return [cmd.length + 1, ...cmd.codeUnits, 0x0a];
}

int _getBits12(List<int> b, int startBit) {
  final byteIdx = startBit ~/ 8;
  final bitIdx = startBit % 8;
  if (byteIdx + 2 > b.length) return 0;
  if (bitIdx == 0) {
    return (b[byteIdx] & 0xff) | ((b[byteIdx + 1] & 0x0f) << 8);
  }
  return ((b[byteIdx] >> 4) & 0x0f) | ((b[byteIdx + 1] & 0xff) << 4);
}

List<double> parseEegPacket(List<int> bytes) {
  if (bytes.length < _eegPacketPayloadBytes) return [];
  final samples = <double>[];
  for (int i = 0; i < 12; i++) {
    final raw = _getBits12(bytes, 16 + i * 12);
    samples.add(_scale12BitToMicrovolts * (raw - 2048));
  }
  return samples;
}

int channelIndexFromUuid(String uuid) {
  switch (uuid.toLowerCase()) {
    case tp9Uuid:
      return 0;
    case af7Uuid:
      return 1;
    case af8Uuid:
      return 2;
    case tp10Uuid:
      return 3;
    case rightAuxUuid:
      return 4;
    default:
      return -1;
  }
}

class Muse2Stream {
  Muse2Stream({
    required this.device,
    required this.onEegSamples,
  });

  final BluetoothDevice device;
  final void Function(int channel, List<double> samplesMicrovolts) onEegSamples;

  BluetoothCharacteristic? _streamToggle;
  final List<StreamSubscription<List<int>>> _subs = [];
  Timer? _keepAliveTimer;
  bool _streaming = false;

  static const Duration keepAliveInterval = Duration(seconds: 8);

  Future<bool> connectAndStart() async {
    await device.connect();
    await device.discoverServices();
    final services = device.servicesList;
    final interaxon = services.cast<BluetoothService?>().firstWhere(
          (s) => s?.uuid.toString().toLowerCase() == museServiceUuid,
          orElse: () => null,
        );
    if (interaxon == null) return false;

    _streamToggle = interaxon.characteristics.cast<BluetoothCharacteristic?>().firstWhere(
          (c) => c?.uuid.toString().toLowerCase() == streamToggleUuid,
          orElse: () => null,
        );
    if (_streamToggle == null) return false;

    for (final uuid in eegCharacteristicUuids) {
      final c = interaxon.characteristics.cast<BluetoothCharacteristic?>().firstWhere(
            (ch) => ch?.uuid.toString().toLowerCase() == uuid,
            orElse: () => null,
          );
      if (c != null) {
        await c.setNotifyValue(true);
        _subs.add(c.lastValueStream.listen((value) {
          final idx = channelIndexFromUuid(c.uuid.toString());
          if (idx >= 0 && value.isNotEmpty) {
            final samples = parseEegPacket(value);
            if (samples.isNotEmpty) onEegSamples(idx, samples);
          }
        }));
      }
    }

    await _streamToggle!.write(museStartStreamCommand(), withoutResponse: true);
    _streaming = true;
    _keepAliveTimer = Timer.periodic(keepAliveInterval, (_) {
      if (_streaming) _streamToggle?.write(museKeepAliveCommand(), withoutResponse: true);
    });
    return true;
  }

  Future<void> stopAndDisconnect() async {
    _streaming = false;
    _keepAliveTimer?.cancel();
    _keepAliveTimer = null;
    if (_streamToggle != null) {
      await _streamToggle!.write(museStopStreamCommand(), withoutResponse: true);
    }
    for (final s in _subs) await s.cancel();
    _subs.clear();
    await device.disconnect();
  }
}
