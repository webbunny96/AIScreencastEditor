import { Video, Scissors } from 'lucide-react'

export function Header() {
  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <Video className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                AI Screencast Editor
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Edit videos with AI-powered precision
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Scissors className="h-4 w-4" />
              <span>Upload Video</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}