import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Welcome from "./pages/Welcome.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import NewTournament from "./pages/NewTournament.jsx";
import TournamentLayout, {
  TournamentIndex,
} from "./pages/tournament/TournamentLayout.jsx";
import StartingRank from "./pages/tournament/StartingRank.jsx";
import Overview from "./pages/tournament/Overview.jsx";
import Pairings from "./pages/tournament/Pairings.jsx";
import RoundHistoryPage from "./pages/tournament/RoundHistoryPage.jsx";
import Standings from "./pages/tournament/Standings.jsx";
import Module from "./pages/tournament/Module.jsx";

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/new" element={<NewTournament />} />
        <Route path="/tournament/:id" element={<TournamentLayout />}>
          <Route index element={<TournamentIndex />} />
          <Route path="starting-rank" element={<StartingRank />} />
          <Route path="overview" element={<Overview />} />
          <Route path="pairings" element={<Pairings />} />
          <Route path="rounds" element={<RoundHistoryPage />} />
          <Route path="standings" element={<Standings />} />
          <Route path="module" element={<Module />} />
        </Route>
      </Routes>
    </>
  );
}
