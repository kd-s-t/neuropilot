import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../app_scope.dart';
import '../api/api_client.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLogin = true;
  bool _loading = false;
  String? _error;
  bool _submitAttempted = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  bool get _emailValid {
    final e = _emailController.text.trim();
    if (e.isEmpty) return false;
    return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(e);
  }

  bool get _passwordValid {
    final p = _passwordController.text;
    if (_isLogin) return p.isNotEmpty;
    return p.length >= 6;
  }

  Future<void> _submit() async {
    setState(() {
      _submitAttempted = true;
      _error = null;
    });
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (email.isEmpty || !_emailValid || password.isEmpty || (!_isLogin && password.length < 6)) {
      return;
    }
    final scope = NeuroPilotScope.of(context);
    setState(() => _loading = true);
    try {
      if (_isLogin) {
        final res = await scope.api.authLogin(email, password);
        await scope.authStorage.setToken(res.accessToken);
        scope.onLogin();
        if (mounted) context.go('/home');
      } else {
        await scope.api.authRegister(email, password);
        final res = await scope.api.authLogin(email, password);
        await scope.authStorage.setToken(res.accessToken);
        scope.onLogin();
        if (mounted) context.go('/home');
      }
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
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 340),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'NeuroPilot',
                    style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 24),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            _isLogin ? 'Login' : 'Register',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 16),
                          TextField(
                            controller: _emailController,
                            keyboardType: TextInputType.emailAddress,
                            decoration: InputDecoration(
                              labelText: 'Email',
                              errorText: _submitAttempted
                                  ? (_emailController.text.trim().isEmpty
                                      ? 'Email is required'
                                      : (!_emailValid ? 'Enter a valid email' : null))
                                  : null,
                            ),
                            onChanged: (_) => setState(() => _error = null),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _passwordController,
                            obscureText: true,
                            decoration: InputDecoration(
                              labelText: 'Password',
                              errorText: _submitAttempted && !_passwordValid
                                  ? (_passwordController.text.isEmpty
                                      ? 'Password is required'
                                      : 'At least 6 characters')
                                  : null,
                            ),
                            onChanged: (_) => setState(() => _error = null),
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 8),
                            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                          ],
                          const SizedBox(height: 20),
                          FilledButton(
                            onPressed: _loading ? null : _submit,
                            child: _loading
                                ? const SizedBox(
                                    height: 20,
                                    width: 20,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : Text(_isLogin ? 'Login' : 'Register'),
                          ),
                          TextButton(
                            onPressed: () {
                              setState(() {
                                _isLogin = !_isLogin;
                                _error = null;
                                _submitAttempted = false;
                              });
                            },
                            child: Text(_isLogin ? "Don't have an account? Register" : 'Already have an account? Login'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
