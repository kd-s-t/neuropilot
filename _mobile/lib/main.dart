import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api/api_client.dart';
import 'auth/auth_storage.dart';
import 'app_router.dart';
import 'app_scope.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final authStorage = AuthStorage(prefs);
  final api = ApiClient();
  final isLoggedIn = authStorage.token != null && authStorage.token!.isNotEmpty;

  runApp(NeuroPilotApp(
    authStorage: authStorage,
    api: api,
    initialLoggedIn: isLoggedIn,
  ));
}

class NeuroPilotApp extends StatefulWidget {
  const NeuroPilotApp({
    super.key,
    required this.authStorage,
    required this.api,
    required this.initialLoggedIn,
  });

  final AuthStorage authStorage;
  final ApiClient api;
  final bool initialLoggedIn;

  @override
  State<NeuroPilotApp> createState() => _NeuroPilotAppState();
}

class _NeuroPilotAppState extends State<NeuroPilotApp> {
  late bool _isLoggedIn;

  @override
  void initState() {
    super.initState();
    _isLoggedIn = widget.initialLoggedIn;
  }

  void _onLogin() => setState(() => _isLoggedIn = true);
  void _onLogout() => setState(() => _isLoggedIn = false);

  @override
  Widget build(BuildContext context) {
    return NeuroPilotScope(
      api: widget.api,
      authStorage: widget.authStorage,
      onLogin: _onLogin,
      onLogout: _onLogout,
      child: MaterialApp.router(
        title: 'NeuroPilot',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
          useMaterial3: true,
        ),
        routerConfig: createAppRouter(_isLoggedIn),
      ),
    );
  }
}
