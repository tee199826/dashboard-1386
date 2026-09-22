import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { DataProvider } from "../shared/state/DataContext.jsx"
import { AuthProvider } from "../shared/state/AuthContext.jsx"
import { PresentationProvider } from "../shared/state/PresentationContext.jsx"
import { FilterProvider } from "../shared/state/FilterContext.jsx"
import { ProtectedRoute } from "../shared/security/ProtectedRoute.jsx"
import Overview from "../features/overview/Overview.jsx"
import AllDistricts from "../features/districts/AllDistricts.jsx"
import BehaviorTable from "../features/districts/BehaviorTable.jsx"
import DataTable from "../features/complaints/DataTable.jsx"
import Login from "../features/admin/Login.jsx"
import AuditLogs from "../features/admin/AuditLogs.jsx"
import UserManagement from "../features/admin/UserManagement.jsx"
import Operations from "../features/operations/Operations.jsx"
import SubstanceRadar from "../features/radar/SubstanceRadar.jsx"
import PixelMap from "../features/pixel-map/PixelMap.jsx"
import UploadPage from "../features/upload/UploadPage.jsx"
import BknPage from "../features/bkn/BknPage.jsx"
import SubstanceUsers from "../features/intelligence/SubstanceUsers.jsx"
import ComplaintsPage from "../features/complaints/ComplaintsPage.jsx"
import SituationPage from "../features/situation/SituationPage.jsx"
import DrugEvidence from "../features/situation/DrugEvidence.jsx"
import InterviewForm from "../features/intelligence/InterviewForm.jsx"
import InterviewSearch from "../features/intelligence/InterviewSearch.jsx"
import Admin from "../features/admin/Admin.jsx"
import RptFieldEntry from "../features/rpt/RptFieldEntry.jsx"
import { MainLayout, ScrollToTop } from "./layout/MainLayout.jsx"

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <PresentationProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/radar" element={<MainLayout><SubstanceRadar /></MainLayout>} />
            <Route path="/pixel-map" element={<MainLayout><FilterProvider><PixelMap /></FilterProvider></MainLayout>} />

            <Route path="/" element={<MainLayout><FilterProvider><Overview /></FilterProvider></MainLayout>} />
            <Route path="/districts" element={<MainLayout><FilterProvider><AllDistricts /></FilterProvider></MainLayout>} />
            <Route path="/districts/behavior-table" element={<MainLayout><FilterProvider><BehaviorTable /></FilterProvider></MainLayout>} />
            <Route path="/operations" element={<MainLayout><FilterProvider><Operations /></FilterProvider></MainLayout>} />
            <Route path="/bkn" element={<MainLayout><FilterProvider><BknPage /></FilterProvider></MainLayout>} />
            {/* ข้อมูลผู้เสพรายคน (อายุ/อาชีพ/รายได้/ประวัติจับกุม-บำบัด/แหล่งซื้อ) — อยู่ในหมวด "ฐานข้อมูลการข่าว"
                ของ sidebar ที่ซ่อนจากคนทั่วไปอยู่แล้ว แต่ route เดิมไม่ได้ห่อ guard → เข้าตรงด้วย URL ได้ */}
            <Route path="/substance-users" element={
              <ProtectedRoute><MainLayout><FilterProvider><SubstanceUsers /></FilterProvider></MainLayout></ProtectedRoute>
            } />
            <Route path="/complaints" element={<MainLayout><FilterProvider><ComplaintsPage /></FilterProvider></MainLayout>} />
            <Route path="/situation" element={<MainLayout><FilterProvider><SituationPage /></FilterProvider></MainLayout>} />

            <Route path="/situation/drug-evidence" element={<MainLayout><DrugEvidence /></MainLayout>} />

            {/* ฐานข้อมูลการข่าว — ผู้ดูแลระบบเท่านั้น (ข้อมูลอ่อนไหว) */}
            <Route path="/intel/interview" element={
              <ProtectedRoute><MainLayout><InterviewSearch /></MainLayout></ProtectedRoute>
            } />
            <Route path="/intel/interview/new" element={
              <ProtectedRoute><MainLayout><InterviewForm /></MainLayout></ProtectedRoute>
            } />

            {/* Admin · Data Health — ผู้ดูแลระบบเท่านั้น (SEC-07: เดิมเปิด public ชั่วคราว) */}
            <Route path="/rpt-entry" element={
              <ProtectedRoute><MainLayout><RptFieldEntry /></MainLayout></ProtectedRoute>
            } />

            <Route path="/admin" element={
              <ProtectedRoute><MainLayout><Admin /></MainLayout></ProtectedRoute>
            } />

            <Route path="/upload" element={
              <ProtectedRoute><MainLayout><UploadPage /></MainLayout></ProtectedRoute>
            } />

            <Route path="/admin/data" element={
              <ProtectedRoute><MainLayout><DataTable /></MainLayout></ProtectedRoute>
            } />
            <Route path="/admin/logs" element={
              <ProtectedRoute><MainLayout><AuditLogs /></MainLayout></ProtectedRoute>
            } />
            <Route path="/admin/users" element={
              <ProtectedRoute><MainLayout><UserManagement /></MainLayout></ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </PresentationProvider>
      </DataProvider>
    </AuthProvider>
  )
}
