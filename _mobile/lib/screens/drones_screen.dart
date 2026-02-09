import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../app_scope.dart';
import '../api/api_client.dart';

class DronesScreen extends StatefulWidget {
  const DronesScreen({super.key});

  @override
  State<DronesScreen> createState() => _DronesScreenState();
}

class _DronesScreenState extends State<DronesScreen> {
  List<MachineListItem> _machines = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final scope = NeuroPilotScope.of(context);
    final token = scope.authStorage.token;
    if (token == null || token.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await scope.api.machinesGetAll(token);
      if (mounted) setState(() => _machines = list);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Drones')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: _load, child: const Text('Retry')),
                    ],
                  ),
                )
              : _machines.isEmpty
                  ? const Center(child: Text('No drones'))
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _machines.length,
                      itemBuilder: (context, i) {
                        final m = _machines[i];
                        return Card(
                          child: ListTile(
                            title: Text(m.name),
                            subtitle: Text('${m.type} · ${m.createdAt.split('T').first}'),
                            onTap: () => context.push('/home/drones/${m.id}'),
                          ),
                        );
                      },
                    ),
    );
  }
}
