import 'package:flutter/material.dart';
import 'api/api_client.dart';
import 'auth/auth_storage.dart';

class NeuroPilotScope extends InheritedWidget {
  const NeuroPilotScope({
    super.key,
    required this.api,
    required this.authStorage,
    required this.onLogin,
    required this.onLogout,
    required super.child,
  });

  final ApiClient api;
  final AuthStorage authStorage;
  final VoidCallback onLogin;
  final VoidCallback onLogout;

  static NeuroPilotScope of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<NeuroPilotScope>();
    assert(scope != null);
    return scope!;
  }

  @override
  bool updateShouldNotify(NeuroPilotScope oldWidget) =>
      api != oldWidget.api ||
      authStorage != oldWidget.authStorage ||
      onLogin != oldWidget.onLogin ||
      onLogout != oldWidget.onLogout;
}
