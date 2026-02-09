import 'package:flutter_test/flutter_test.dart';
import 'package:neuropilot_mobile/api/api_client.dart';

void main() {
  test('AuthLoginResponse.fromJson', () {
    final j = <String, dynamic>{'access_token': 'tok', 'token_type': 'bearer'};
    final r = AuthLoginResponse.fromJson(j);
    expect(r.accessToken, 'tok');
    expect(r.tokenType, 'bearer');
  });
}
