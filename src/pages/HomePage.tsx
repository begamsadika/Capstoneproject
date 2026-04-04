import { useState } from 'react';
import { Apple, TrendingUp, Award, ChevronRight, Sparkles } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { WelloraLogoMark } from '../components/WelloraLogoMark';

interface HomePageProps {
  onNavigate: (page: 'login' | 'register') => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);

  const features = [
    {
      icon: Apple,
      title: 'Personalized Recommendations',
      description: 'Our advanced AI analyzes your health profile, dietary preferences, and fitness goals to deliver meal plans tailored just for you',
    },
    {
      icon: TrendingUp,
      title: 'Effortless Meal Ordering',
      description: 'Order healthy, chef-prepared meals directly from our curated menu. Fresh, nutritious, and delicious delivered to your doorstep.',
    },
    {
      icon: Award,
      title: 'Partner-Guided Wellness',
      description: 'Connect with your gym or hospital for integrated wellness plans and professional guidance, enhancing your health journey.',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-wellora-light via-white to-wellora-soft dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-500">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE2YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTE2IDBjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00em0tOCA4YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptLTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTE2IDBjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00em0tMTYgOGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6bTggMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-40 dark:opacity-20"></div>

      <div className="relative">
        <nav className="container mx-auto px-6 py-6 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <WelloraLogoMark size="lg" />
            <span className="text-3xl font-bold text-wellora dark:text-wellora">Wellora</span>
          </div>

          <div className="flex items-center space-x-4">
            <ThemeToggle />
            <button
              onClick={() => onNavigate('login')}
              className="px-6 py-2.5 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
            >
              Login
            </button>
            <button
              onClick={() => onNavigate('register')}
              className="px-6 py-2.5 bg-wellora text-white hover:bg-wellora-hover rounded-full font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
            >
              Get Started
            </button>
          </div>
        </nav>

        <main className="container mx-auto px-6 pt-20 pb-32">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-full border border-wellora/25 dark:border-wellora/30 mb-6 animate-fade-in">
              <Sparkles className="w-4 h-4 text-wellora dark:text-wellora" />
              <span className="text-sm font-medium text-wellora dark:text-wellora">
                AI-Powered Nutrition Platform
              </span>
            </div>

            <h1 className="text-6xl md:text-7xl font-bold leading-tight">
              <span className="bg-gradient-to-r from-wellora to-wellora-dark bg-clip-text text-transparent animate-gradient">
                Order Smart Meals
              </span>
              <br />
              <span className="text-gray-800 dark:text-white">
                Live Healthier
              </span>
            </h1>

            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto leading-relaxed">
              Track your nutrition, receive expert-backed recommendations, and transform your eating habits—all in one intelligent platform.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button
                onClick={() => onNavigate('register')}
                className="group px-8 py-4 bg-wellora text-white hover:bg-wellora-hover rounded-full font-semibold shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-300 flex items-center space-x-2"
              >
                <span>Start Free Trial</span>
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => onNavigate('login')}
                className="px-8 py-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-800 dark:text-white rounded-full font-semibold border-2 border-gray-200 dark:border-gray-700 hover:border-wellora dark:hover:border-wellora shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
              >
                Login
              </button>
            </div>
          </div>

          {/* <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mt-32">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  onMouseEnter={() => setHoveredFeature(index)}
                  onMouseLeave={() => setHoveredFeature(null)}
                  className="group relative"
                >
                  <div
                    className={`absolute inset-0 bg-gradient-to-r ${feature.color} rounded-3xl blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-500`}
                  ></div>
                  <div className="relative bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl p-8 rounded-3xl border border-white/20 dark:border-gray-700/50 shadow-xl hover:shadow-2xl transform hover:-translate-y-2 transition-all duration-500">
                    <div
                      className={`inline-flex p-4 rounded-2xl bg-gradient-to-r ${feature.color} mb-6 transform transition-transform duration-500 ${
                        hoveredFeature === index ? 'scale-110 rotate-6' : ''
                      }`}
                    >
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">
                      {feature.title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div> */}

          <div className="mt-32 pt-16 border-t border-gray-200 dark:border-gray-700/50">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-gray-800 dark:text-white mb-4">
                How Wellora Transforms Your Health
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={index}
                    onMouseEnter={() => setHoveredFeature(index)}
                    onMouseLeave={() => setHoveredFeature(null)}
                    className="group relative"
                  >
                    <div className="relative bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm p-8 rounded-3xl border-2 border-gray-200 dark:border-gray-700 text-center h-full">
                      <div
                        className={`inline-flex p-4 rounded-2xl bg-wellora text-white mb-6 transform transition-transform duration-500 ${
                          hoveredFeature === index ? 'scale-110' : ''
                        }`}
                      >
                        <Icon className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-3">
                        {feature.title}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        <footer className="bg-white/50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 py-16">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-8 mb-12">
              {/* Brand Column */}
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <WelloraLogoMark size="sm" />
                  <span className="text-lg font-bold text-wellora dark:text-wellora">Wellora</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Eat Smart. Live Well. Personalized AI-powered healthy meal recommendations.
                </p>
              </div>

              {/* Company Links */}
              <div>
                <h4 className="font-semibold text-gray-800 dark:text-white mb-4">Company</h4>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li><a href="#" className="hover:text-wellora dark:hover:text-wellora transition">About Us</a></li>
                  <li><a href="#" className="hover:text-wellora dark:hover:text-wellora transition">Careers</a></li>
                  <li><a href="#" className="hover:text-wellora dark:hover:text-wellora transition">Blog</a></li>
                </ul>
              </div>

              {/* Support Links */}
              <div>
                <h4 className="font-semibold text-gray-800 dark:text-white mb-4">Support</h4>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li><a href="#" className="hover:text-wellora dark:hover:text-wellora transition">FAQ</a></li>
                  <li><a href="#" className="hover:text-wellora dark:hover:text-wellora transition">Contact Us</a></li>
                </ul>
              </div>

              {/* Legal Links */}
              <div>
                <h4 className="font-semibold text-gray-800 dark:text-white mb-4">Legal</h4>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li><a href="#" className="hover:text-wellora dark:hover:text-wellora transition">Privacy Policy</a></li>
                  <li><a href="#" className="hover:text-wellora dark:hover:text-wellora transition">Terms of Service</a></li>
                </ul>
              </div>

              {/* Social Links */}
              <div>
                <h4 className="font-semibold text-gray-800 dark:text-white mb-4">Connect</h4>
                <div className="flex items-center space-x-4">
                  <a href="#" className="text-gray-600 dark:text-gray-400 hover:text-wellora dark:hover:text-wellora transition">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  </a>
                  <a href="#" className="text-gray-600 dark:text-gray-400 hover:text-wellora dark:hover:text-wellora transition">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2s9 5 20 5a9.5 9.5 0 00-9-5.5c4.75 2.25 7-7 7-7s1.1 5.2-5.2 8.3A5.5 5.5 0 0123 3z"/></svg>
                  </a>
                  <a href="#" className="text-gray-600 dark:text-gray-400 hover:text-wellora dark:hover:text-wellora transition">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" fill="currentColor"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor"/></svg>
                  </a>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-8">
              <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                © 2026 Wellora. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
