import { Header } from './components/Header'
import { MainEditor } from './components/MainEditor'
import { Footer } from './components/Footer'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastContainer } from './components/Toast'
import './App.css'

function App() {
  return (
    <ErrorBoundary>
      <div className="app min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <Header />
        <MainEditor />
        <Footer />
        <ToastContainer />
      </div>
    </ErrorBoundary>
  )
}

export default App