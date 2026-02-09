import 'package:shared_preferences/shared_preferences.dart';

class AuthStorage {
  static const _keyToken = 'neuropilot_access_token';

  final SharedPreferences _prefs;

  AuthStorage(this._prefs);

  String? get token => _prefs.getString(_keyToken);

  Future<void> setToken(String? value) async {
    if (value == null) {
      await _prefs.remove(_keyToken);
    } else {
      await _prefs.setString(_keyToken, value);
    }
  }

  Future<void> clear() async => await setToken(null);
}
