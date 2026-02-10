import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class DjiScreen extends StatelessWidget {
  const DjiScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('DJI / Robot')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Send commands to Tello via the NeuroPilot backend. Open Drones, select a machine, then tap a control to trigger its webhook.',
            style: TextStyle(fontSize: 14),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () => context.push('/home/drones'),
            icon: const Icon(Icons.flight),
            label: const Text('Open Drones'),
          ),
        ],
      ),
    );
  }
}
