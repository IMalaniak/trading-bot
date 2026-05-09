import { Navigate, Route, Routes } from 'react-router-dom';

import { DashboardPage } from '../pages/dashboard-page';
import { ThemeProvider } from '../theme';

export function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route element={<DashboardPage />} path="/" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </ThemeProvider>
  );
}

export default App;
