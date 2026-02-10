import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:fl_chart/fl_chart.dart';
import '../eeg/muse2_ble.dart';

class EegScreen extends StatefulWidget {
  const EegScreen({super.key});

  @override
  State<EegScreen> createState() => _EegScreenState();
}

class _EegScreenState extends State<EegScreen> {
  List<BluetoothDevice> _devices = [];
  BluetoothDevice? _connectedDevice;
  Muse2Stream? _museStream;
  bool _scanning = false;
  String? _status;
  final List<double> _graphData = [];
  static const int _maxPoints = 256;
  StreamSubscription<List<ScanResult>>? _scanSubscription;

  @override
  void initState() {
    super.initState();
    _startGraphSimulation();
  }

  bool _isMuse(BluetoothDevice d) =>
      d.platformName.isNotEmpty && d.platformName.toLowerCase().contains('muse');

  void _startGraphSimulation() {
    Future.doWhile(() async {
      if (!mounted) return false;
      if (_museStream != null) return false;
      await Future.delayed(const Duration(milliseconds: 100));
      if (!mounted) return false;
      setState(() {
        final last = _graphData.isEmpty ? 0.0 : _graphData.last;
        _graphData.add(last + (DateTime.now().millisecond % 3 == 0 ? 0.1 : -0.05));
        if (_graphData.length > _maxPoints) _graphData.removeAt(0);
      });
      return true;
    });
  }

  Future<void> _scan() async {
    if (_scanning) return;
    final state = await FlutterBluePlus.adapterState.first;
    if (state != BluetoothAdapterState.on) {
      setState(() => _status = 'Bluetooth is off');
      return;
    }
    setState(() {
      _scanning = true;
      _devices = [];
      _status = 'Scanning...';
    });
    _scanSubscription = FlutterBluePlus.scanResults.listen((results) {
      if (!mounted) return;
      final seen = <String>{};
      final list = <BluetoothDevice>[];
      for (final r in results) {
        if (seen.add(r.device.remoteId.str)) list.add(r.device);
      }
      list.sort((a, b) => _isMuse(b) ? 1 : (_isMuse(a) ? -1 : 0));
      setState(() => _devices = list);
    });
    await FlutterBluePlus.startScan(timeout: const Duration(seconds: 10));
    await Future.delayed(const Duration(seconds: 10));
    if (!mounted) return;
    await FlutterBluePlus.stopScan();
    _scanSubscription?.cancel();
    setState(() {
      _scanning = false;
      _status = _devices.isEmpty ? 'No devices found' : 'Select a device';
    });
  }

  Future<void> _connect(BluetoothDevice device) async {
    setState(() => _status = 'Connecting...');
    try {
      if (_isMuse(device)) {
        final stream = Muse2Stream(
          device: device,
          onEegSamples: (channel, samples) {
            if (!mounted || _museStream == null) return;
            setState(() {
              for (final s in samples) {
                _graphData.add(s);
                if (_graphData.length > _maxPoints) _graphData.removeAt(0);
              }
            });
          },
        );
        final ok = await stream.connectAndStart();
        if (!mounted) return;
        if (ok) {
          _museStream = stream;
          setState(() {
            _connectedDevice = device;
            _status = 'Muse 2 streaming';
          });
        } else {
          setState(() => _status = 'Muse service not found');
        }
      } else {
        await device.connect();
        setState(() {
          _connectedDevice = device;
          _status = 'Connected: ${device.platformName.isNotEmpty ? device.platformName : device.remoteId}';
        });
      }
    } catch (e) {
      setState(() => _status = 'Failed: $e');
    }
  }

  Future<void> _disconnect() async {
    if (_connectedDevice == null) return;
    if (_museStream != null) {
      await _museStream!.stopAndDisconnect();
      _museStream = null;
    } else {
      await _connectedDevice!.disconnect();
    }
    setState(() {
      _connectedDevice = null;
      _status = null;
    });
  }

  @override
  void dispose() {
    _scanSubscription?.cancel();
    if (_museStream != null) {
      unawaited(_museStream!.stopAndDisconnect());
    } else if (_connectedDevice != null) {
      unawaited(_connectedDevice!.disconnect());
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('EEG')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_status != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(_status!, style: Theme.of(context).textTheme.bodyLarge),
            ),
          FilledButton.icon(
            onPressed: _scanning ? null : _scan,
            icon: _scanning
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.bluetooth_searching),
            label: Text(_scanning ? 'Scanning...' : 'Scan for EEG (Bluetooth)'),
          ),
          if (_connectedDevice != null)
            OutlinedButton(
              onPressed: _disconnect,
              child: const Text('Disconnect'),
            ),
          const SizedBox(height: 16),
          ..._devices.map((d) => ListTile(
                title: Text(d.platformName.isNotEmpty ? d.platformName : d.remoteId.str),
                subtitle: Text(d.remoteId.str),
                onTap: () => _connect(d),
              )),
          const SizedBox(height: 24),
          const Text('EEG signal', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          SizedBox(
            height: 200,
            child: LineChart(
              LineChartData(
                minX: 0,
                maxX: _maxPoints.toDouble(),
                minY: -500,
                maxY: 500,
                lineBarsData: [
                  LineChartBarData(
                    spots: _graphData.asMap().entries.map((e) => FlSpot(e.key.toDouble(), e.value)).toList(),
                    isCurved: true,
                    color: Theme.of(context).colorScheme.primary,
                    barWidth: 2,
                    dotData: const FlDotData(show: false),
                  ),
                ],
              ),
              duration: const Duration(milliseconds: 150),
            ),
          ),
        ],
      ),
    );
  }
}
