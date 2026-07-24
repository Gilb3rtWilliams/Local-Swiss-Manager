import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./AuthContext.jsx";
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
import Chess960 from "./pages/tournament/Chess960.jsx";
import Register from "./pages/Register.jsx";
import PublicResults from "./pages/PublicResults.jsx";
import PastTournaments from "./pages/PastTournaments.jsx";
import Login from "./pages/Login.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Navbar />
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/new" element={<NewTournament />} />
        <Route path="/register/:token" element={<Register />} />
        <Route path="/results/:token" element={<PublicResults />} />
        <Route path="/tournaments" element={<PastTournaments />} />
        <Route path="/login" element={<Login />} />
        <Route path="/tournament/:id" element={<TournamentLayout />}>
          <Route index element={<TournamentIndex />} />
          <Route path="starting-rank" element={<StartingRank />} />
          <Route path="overview" element={<Overview />} />
          <Route path="pairings" element={<Pairings />} />
          <Route path="rounds" element={<RoundHistoryPage />} />
          <Route path="standings" element={<Standings />} />
          <Route path="module" element={<Module />} />
          <Route path="chess960" element={<Chess960 />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
