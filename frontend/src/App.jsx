import { Routes, Route } from 'react-router-dom';
import Welcome from './pages/Welcome.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewTournament from './pages/NewTournament.jsx';
import Tournament from './pages/Tournament.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/new" element={<NewTournament />} />
      <Route path="/tournament/:id" element={<Tournament />} />
    </Routes>
  );
}
