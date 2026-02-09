import 'dart:async';
import 'package:flutter/material.dart';
import '../app_scope.dart';
import '../api/api_client.dart';

class DjiScreen extends StatefulWidget {
  const DjiScreen({super.key});

  @override
  State<DjiScreen> createState() => _DjiScreenState();
}

class _DjiScreenState extends State<DjiScreen> {
  final _baseController = TextEditingController(text: 'http://localhost:8888');
  int? _battery;
  TelloHealthResponse? _health;
  String? _error;
  Timer? _pollTimer;

  @override
  void dispose() {
    _baseController.dispose();
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _fetch() async {
    final base = _baseController.text.trim();
    if (base.isEmpty) {
      setState(() => _error = 'Enter Tello base URL');
      return;
    }
    setState(() => _error = null);
    final scope = NeuroPilotScope.of(context);
    try {
      final bat = await scope.api.telloBattery(base: base);
      final h = await scope.api.telloHealth(base: base);
      if (mounted) {
        setState(() {
          _battery = bat.battery;
          _health = h;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _fetch();
    _pollTimer = Timer.periodic(const Duration(seconds: 10), (_) => _fetch());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('DJI / Robot')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Connect phone to robot WiFi, then set the Tello proxy base URL (e.g. your laptop serving the proxy).',
            style: TextStyle(fontSize: 14),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _baseController,
            decoration: const InputDecoration(
              labelText: 'Tello base URL',
              hintText: 'http://192.168.1.100:8888',
            ),
            keyboardType: TextInputType.url,
          ),
          const SizedBox(height: 12),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          FilledButton(
            onPressed: _startPolling,
            child: const Text('Connect & refresh battery'),
          ),
          const SizedBox(height: 24),
          if (_battery != null) ...[
            Row(
              children: [
                Icon(Icons.battery_charging_full, size: 32, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 12),
                Text('Battery: $_battery%', style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 8),
          ],
          if (_health != null)
            Text(
              'Connected: ${_health!.telloConnected}\nStatus: ${_health!.status}',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
        ],
      ),
    );
  }
}
