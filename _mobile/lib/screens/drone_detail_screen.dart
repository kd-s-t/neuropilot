import 'package:flutter/material.dart';
import '../app_scope.dart';
import '../api/api_client.dart';

class DroneDetailScreen extends StatefulWidget {
  const DroneDetailScreen({super.key, required this.machineId});

  final int machineId;

  @override
  State<DroneDetailScreen> createState() => _DroneDetailScreenState();
}

class _DroneDetailScreenState extends State<DroneDetailScreen> {
  MachineDetail? _machine;
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
      final m = await scope.api.machinesGet(widget.machineId, token);
      if (mounted) setState(() => _machine = m);
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
      appBar: AppBar(
        title: Text(_machine?.name ?? 'Drone'),
      ),
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
              : _machine == null
                  ? const Center(child: Text('Not found'))
                  : ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        Text(
                          _machine!.name,
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        Text('Type: ${_machine!.type}', style: Theme.of(context).textTheme.bodyMedium),
                        const SizedBox(height: 24),
                        Text(
                          'Controls',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        if (_machine!.controlPositions == null || _machine!.controlPositions!.isEmpty)
                          const Text('No controls')
                        else
                          ..._machine!.controlPositions!.map((c) => _ControlCard(
                                machineId: widget.machineId,
                                control: c,
                              )),
                      ],
                    ),
    );
  }
}

class _ControlCard extends StatefulWidget {
  const _ControlCard({required this.machineId, required this.control});

  final int machineId;
  final ControlPosition control;

  @override
  State<_ControlCard> createState() => _ControlCardState();
}

class _ControlCardState extends State<_ControlCard> {
  bool _sending = false;

  Future<void> _trigger() async {
    final webhookUrl = widget.control.webhookUrl;
    if (webhookUrl == null || webhookUrl.isEmpty) return;
    final scope = NeuroPilotScope.of(context);
    final token = scope.authStorage.token;
    if (token == null || token.isEmpty) return;
    setState(() => _sending = true);
    try {
      final log = await scope.api.machinesTriggerWebhook(
        widget.machineId,
        widget.control.id,
        webhookUrl,
        token,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(log.success ? 'Sent' : log.errorMessage ?? 'Failed'),
          backgroundColor: log.success ? null : Theme.of(context).colorScheme.error,
        ),
      );
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), backgroundColor: Theme.of(context).colorScheme.error),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: Theme.of(context).colorScheme.error),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.control;
    final hasWebhook = c.webhookUrl != null && c.webhookUrl!.isNotEmpty;
    return Card(
      child: ListTile(
        title: Text(c.id),
        subtitle: c.description != null && c.description!.isNotEmpty ? Text(c.description!) : null,
        trailing: hasWebhook
            ? FilledButton(
                onPressed: _sending ? null : _trigger,
                child: _sending ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Send'),
              )
            : Text('${c.x.toStringAsFixed(0)}, ${c.y.toStringAsFixed(0)}'),
      ),
    );
  }
}
