import 'package:go_router/go_router.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/eeg_screen.dart';
import 'screens/dji_screen.dart';
import 'screens/drones_screen.dart';
import 'screens/drone_detail_screen.dart';

GoRouter createAppRouter(bool isLoggedIn) {
  return GoRouter(
    initialLocation: isLoggedIn ? '/home' : '/login',
    redirect: (context, state) {
      final onLogin = state.matchedLocation == '/login';
      if (!isLoggedIn && !onLogin) return '/login';
      if (isLoggedIn && onLogin) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(
        path: '/home',
        builder: (_, __) => const HomeScreen(),
        routes: [
          GoRoute(path: 'eeg', builder: (_, __) => const EegScreen()),
          GoRoute(path: 'dji', builder: (_, __) => const DjiScreen()),
          GoRoute(path: 'drones', builder: (_, __) => const DronesScreen()),
          GoRoute(
            path: 'drones/:id',
            builder: (_, state) {
              final id = state.pathParameters['id']!;
              return DroneDetailScreen(machineId: int.parse(id));
            },
          ),
        ],
      ),
    ],
  );
}
