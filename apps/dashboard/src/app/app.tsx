import { Navigate, Route, Routes } from 'react-router-dom';

import { DashboardPage } from '../pages/dashboard-page';
import { PortfolioListPage } from '../pages/portfolio-list-page';
import { StrategiesPage } from '../pages/strategies-page';
import { ThemeProvider } from '../theme';

export function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route element={<PortfolioListPage />} path="/" />
        <Route element={<DashboardPage />} path="/portfolios/:portfolioId" />
        <Route element={<StrategiesPage />} path="/strategies" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </ThemeProvider>
  );
}

export default App;
