import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  ApiClient({
    this.baseUrl = 'http://localhost:8000',
    this.telloBaseUrl = 'http://localhost:8888',
  });

  final String baseUrl;
  final String telloBaseUrl;

  Map<String, String> _headers([String? token]) {
    final h = <String, String>{'Content-Type': 'application/json'};
    if (token != null && token.isNotEmpty) h['Authorization'] = 'Bearer $token';
    return h;
  }

  Future<T> _handleRes<T>(http.Response res, T Function(dynamic) fromJson) async {
    if (res.statusCode == 401) {
      final body = jsonDecode(res.body) as Map<String, dynamic>?;
      throw ApiException(body?['detail'] as String? ?? 'Incorrect email or password');
    }
    if (!res.statusCode.toString().startsWith('2')) {
      final body = jsonDecode(res.body) as Map<String, dynamic>?;
      throw ApiException(body?['detail'] as String? ?? 'HTTP ${res.statusCode}');
    }
    if (res.body.isEmpty) return fromJson(null);
    return fromJson(jsonDecode(res.body));
  }

  Future<bool> backendReachable({int timeoutMs = 3000}) async {
    try {
      final r = await http.get(Uri.parse('$baseUrl/health')).timeout(
        Duration(milliseconds: timeoutMs),
      );
      return r.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<AuthLoginResponse> authLogin(String email, String password) async {
    final body = 'username=${Uri.encodeComponent(email)}&password=${Uri.encodeComponent(password)}';
    final r = await http
        .post(
          Uri.parse('$baseUrl/auth/login'),
          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
          body: body,
        )
        .timeout(const Duration(milliseconds: 8000));
    return _handleRes(r, (d) => AuthLoginResponse.fromJson(d as Map<String, dynamic>));
  }

  Future<AuthRegisterResponse> authRegister(String email, String password) async {
    final r = await http.post(
      Uri.parse('$baseUrl/auth/register'),
      headers: _headers(),
      body: jsonEncode({'email': email, 'password': password}),
    );
    return _handleRes(r, (d) => AuthRegisterResponse.fromJson(d as Map<String, dynamic>));
  }

  Future<void> authLogout(String? token) async {
    if (token == null || token.isEmpty) return;
    final r = await http.post(
      Uri.parse('$baseUrl/auth/logout'),
      headers: _headers(token),
    );
    if (r.statusCode != 200 && r.statusCode != 401) {
      final body = jsonDecode(r.body) as Map<String, dynamic>?;
      throw ApiException(body?['detail'] as String? ?? 'HTTP ${r.statusCode}');
    }
  }

  Future<List<MachineListItem>> machinesGetAll(String? token) async {
    if (token == null || token.isEmpty) throw ApiException('Not authenticated');
    final r = await http.get(
      Uri.parse('$baseUrl/machines'),
      headers: _headers(token),
    );
    return _handleRes(r, (d) {
      final list = d as List<dynamic>? ?? [];
      return list.map((e) => MachineListItem.fromJson(e as Map<String, dynamic>)).toList();
    });
  }

  Future<MachineDetail> machinesGet(int machineId, String? token) async {
    if (token == null || token.isEmpty) throw ApiException('Not authenticated');
    final r = await http.get(
      Uri.parse('$baseUrl/machines/$machineId'),
      headers: _headers(token),
    );
    return _handleRes(r, (d) => MachineDetail.fromJson(d as Map<String, dynamic>));
  }

  Future<TelloBatteryResponse> telloBattery({String? base}) async {
    final host = base ?? telloBaseUrl;
    try {
      final r = await http.get(Uri.parse('$host/battery'));
      final d = jsonDecode(r.body) as Map<String, dynamic>? ?? {};
      return TelloBatteryResponse(
        battery: d['battery'] as int?,
        message: d['message'] as String?,
      );
    } catch (_) {
      return TelloBatteryResponse(battery: null);
    }
  }

  Future<TelloHealthResponse?> telloHealth({String? base}) async {
    final host = base ?? telloBaseUrl;
    try {
      final r = await http.get(Uri.parse('$host/health'));
      if (r.statusCode != 200) return null;
      final d = jsonDecode(r.body) as Map<String, dynamic>? ?? {};
      return TelloHealthResponse(
        status: d['status'] as String? ?? '',
        telloConnected: d['tello_connected'] as bool? ?? false,
      );
    } catch (_) {
      return null;
    }
  }
}

class ApiException implements Exception {
  ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

class AuthLoginResponse {
  AuthLoginResponse({required this.accessToken, required this.tokenType});
  final String accessToken;
  final String tokenType;
  factory AuthLoginResponse.fromJson(Map<String, dynamic> j) {
    return AuthLoginResponse(
      accessToken: j['access_token'] as String,
      tokenType: j['token_type'] as String? ?? 'bearer',
    );
  }
}

class AuthRegisterResponse {
  AuthRegisterResponse({required this.id, required this.email, required this.isActive});
  final int id;
  final String email;
  final bool isActive;
  factory AuthRegisterResponse.fromJson(Map<String, dynamic> j) {
    return AuthRegisterResponse(
      id: j['id'] as int,
      email: j['email'] as String,
      isActive: j['is_active'] as bool? ?? true,
    );
  }
}

class MachineListItem {
  MachineListItem({required this.id, required this.name, required this.type, required this.createdAt});
  final int id;
  final String name;
  final String type;
  final String createdAt;
  factory MachineListItem.fromJson(Map<String, dynamic> j) {
    return MachineListItem(
      id: j['id'] as int,
      name: j['name'] as String,
      type: j['type'] as String,
      createdAt: j['created_at'] as String,
    );
  }
}

class ControlPosition {
  ControlPosition({required this.id, this.description, required this.x, required this.y, this.webhookUrl});
  final String id;
  final String? description;
  final double x;
  final double y;
  final String? webhookUrl;
  factory ControlPosition.fromJson(Map<String, dynamic> j) {
    return ControlPosition(
      id: j['id'] as String,
      description: j['description'] as String?,
      x: (j['x'] as num).toDouble(),
      y: (j['y'] as num).toDouble(),
      webhookUrl: j['webhook_url'] as String?,
    );
  }
}

class MachineDetail {
  MachineDetail({
    required this.id,
    required this.name,
    required this.type,
    required this.createdAt,
    this.controlPositions,
  });
  final int id;
  final String name;
  final String type;
  final String createdAt;
  final List<ControlPosition>? controlPositions;
  factory MachineDetail.fromJson(Map<String, dynamic> j) {
    final cp = j['control_positions'] as List<dynamic>?;
    return MachineDetail(
      id: j['id'] as int,
      name: j['name'] as String,
      type: j['type'] as String,
      createdAt: j['created_at'] as String,
      controlPositions: cp?.map((e) => ControlPosition.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }
}

class TelloBatteryResponse {
  TelloBatteryResponse({this.battery, this.message});
  final int? battery;
  final String? message;
}

class TelloHealthResponse {
  TelloHealthResponse({required this.status, required this.telloConnected});
  final String status;
  final bool telloConnected;
}
