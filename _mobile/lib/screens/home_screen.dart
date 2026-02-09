import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../app_scope.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final scope = NeuroPilotScope.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('NeuroPilot'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await scope.authStorage.clear();
              scope.onLogout();
              if (context.mounted) context.go('/login');
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ListTile(
            leading: const Icon(Icons.psychology),
            title: const Text('Connect EEG'),
            subtitle: const Text('Bluetooth'),
            onTap: () => context.push('/home/eeg'),
          ),
          ListTile(
            leading: const Icon(Icons.flight),
            title: const Text('Connect DJI / Robot'),
            subtitle: const Text('WiFi'),
            onTap: () => context.push('/home/dji'),
          ),
          ListTile(
            leading: const Icon(Icons.list),
            title: const Text('Drones'),
            subtitle: const Text('View list and controls'),
            onTap: () => context.push('/home/drones'),
          ),
        ],
      ),
    );
  }
}
