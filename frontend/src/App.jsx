import { useState } from 'react';
import { SignInButton, SignedIn, SignedOut, UserButton, useUser } from '@clerk/clerk-react';
import { Copy, Sparkles, Send, Loader2 } from 'lucide-react';
import axios from 'axios';

function App() {
  const { user } = useUser();
  const [platform, setPlatform] = useState('reddit');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [latestPost, setLatestPost] = useState('');
  
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!username.trim()) return;

    setIsLoading(true);
    setGeneratedMessage('');
    setCopied(false);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await axios.post(`${apiUrl}/api/generate`, {
        username: username.trim(),
        target_platform: platform,
        bio: bio.trim(),
        latest_post: latestPost.trim()
      });

      setGeneratedMessage(response.data.message);
    } catch (error) {
      console.error('Error generating message:', error);
      alert('Failed to generate message. Check console for details.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col w-full font-sans">
      {/* Navbar */}
      <header className="px-8 py-5 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50 backdrop-blur-md sticky top-0 z-10 w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Outrench</h1>
        </div>
        <div>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="bg-white text-black px-4 py-2 rounded-full text-sm font-semibold hover:bg-neutral-200 transition-colors">
                Sign In
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton appearance={{ elements: { userButtonAvatarBox: "w-9 h-9" } }} />
          </SignedIn>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-8 flex flex-col items-center">
        
        <SignedOut>
          <div className="text-center mt-20 flex flex-col items-center max-w-md">
            <h2 className="text-4xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">AI Outreach Engine</h2>
            <p className="text-neutral-400 mb-8 max-w-sm text-lg leading-relaxed">
              Generate hyper-personalized, non-spammy outreach messages to channel users to Tagmine.
            </p>
            <SignInButton mode="modal">
              <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-full font-bold shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-2">
                Get Started <Send size={16}/>
              </button>
            </SignInButton>
          </div>
        </SignedOut>

        <SignedIn>
          <div className="text-center mb-10 w-full mt-8">
            <h2 className="text-3xl font-bold mb-2">Welcome back, {user?.firstName || 'Founder'} 👋</h2>
            <p className="text-neutral-400">Let's find some users for Tagmine today.</p>
          </div>

          <div className="w-full flex flex-col md:flex-row gap-8 items-start justify-center">
            
            {/* Input Form Card */}
            <div className="bg-neutral-900/80 border border-neutral-800 p-6 rounded-2xl w-full max-w-md shadow-2xl backdrop-blur-sm">
              <div className="mb-6">
                <label className="block text-sm font-medium text-neutral-400 mb-2">Target Platform</label>
                <div className="flex bg-neutral-950 rounded-lg p-1 border border-neutral-800">
                  {['reddit', 'twitter', 'email'].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPlatform(p)}
                      className={`flex-1 py-2 text-sm font-medium rounded-md capitalize transition-all ${
                        platform === p 
                          ? 'bg-neutral-800 text-white shadow-sm' 
                          : 'text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Target Handle/Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. u/startup_fanatic"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white placeholder-neutral-600 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">User Bio (Optional Context)</label>
                  <input
                    type="text"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="e.g. Needs a better developer tool..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white placeholder-neutral-600 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Latest Post/Complaint (Optional)</label>
                  <textarea
                    value={latestPost}
                    onChange={(e) => setLatestPost(e.target.value)}
                    placeholder="e.g. 'I spend so much time struggling with X...'"
                    rows={3}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white placeholder-neutral-600 transition-colors resize-none"
                  />
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={!username.trim() || isLoading}
                  className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all"
                >
                  {isLoading ? (
                    <><Loader2 size={18} className="animate-spin" /> Generating...</>
                  ) : (
                    <><Sparkles size={18} /> Generate Magic Reply</>
                  )}
                </button>
              </div>
            </div>

            {/* Results Card */}
            <div className="w-full max-w-md flex flex-col gap-4">
              <div className={`bg-neutral-900/80 border ${generatedMessage ? 'border-indigo-500/50 shadow-indigo-500/10 shadow-xl' : 'border-neutral-800'} p-6 rounded-2xl flex-1 flex flex-col justify-between transition-all duration-300 relative overflow-hidden backdrop-blur-sm`}>
                
                {generatedMessage && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />}

                {generatedMessage ? (
                  <div className="flex-1 flex flex-col">
                    <h3 className="text-sm font-medium text-indigo-400 mb-4 flex items-center gap-2">
                      <Sparkles size={14} /> Generated for @{username}
                    </h3>
                    <p className="text-white text-lg leading-relaxed flex-1 italic">
                      "{generatedMessage}"
                    </p>
                    
                    <button
                      onClick={copyToClipboard}
                      className="mt-6 w-full bg-white hover:bg-neutral-200 text-black font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                      {copied ? (
                        <span className="text-green-600 font-bold">Copied!</span>
                      ) : (
                        <><Copy size={18} /> Copy to Clipboard</>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 text-center min-h-[200px]">
                    <Send size={32} className="mb-4 opacity-20" />
                    <p>Enter a target profile and context to generate</p>
                    <p className="text-sm">your personalized outreach message.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </SignedIn>

      </main>
    </div>
  );
}

export default App;
