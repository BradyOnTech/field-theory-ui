import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout";
import { ObservatoryView } from "@/views/observatory";
import { StreamView } from "@/views/stream";
import { PeopleView } from "@/views/people";
import { OracleView } from "@/views/oracle";
import { ChronosView } from "@/views/chronos";
import { ForgeView } from "@/views/forge";
import { MirrorView } from "@/views/mirror";


export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ObservatoryView />} />
        <Route path="/stream" element={<StreamView />} />
        <Route path="/people" element={<PeopleView />} />
        <Route path="/people/:handle" element={<PeopleView />} />
        <Route path="/oracle" element={<OracleView />} />
        <Route path="/chronos" element={<ChronosView />} />
        <Route path="/forge" element={<ForgeView />} />
        <Route path="/mirror" element={<MirrorView />} />

      </Route>
    </Routes>
  );
}
