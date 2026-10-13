import React, { useState, useEffect } from 'react';
import { 
  Dumbbell, 
  Calendar, 
  BarChart3, 
  Plus, 
  X, 
  Activity,
  Trash2,
  LogOut,
  Lock
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from './supabaseClient';

function App() {
  const [session, setSession] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState('workout');
  const [workouts, setWorkouts] = useState([]);
  const [currentWorkout, setCurrentWorkout] = useState(() => {
    const saved = localStorage.getItem('repspec_current_workout');
    return saved ? JSON.parse(saved) : null;
  });

  const [exercises, setExercises] = useState([
    { id: 1, name: 'Bench Press', muscleGroup: 'Chest' },
    { id: 2, name: 'Squats', muscleGroup: 'Legs' },
    { id: 3, name: 'Deadlift', muscleGroup: 'Back' },
    { id: 4, name: 'Pull-ups', muscleGroup: 'Back' },
  ]);
  
  // Modals & View States
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [activeLoggingExerciseId, setActiveLoggingExerciseId] = useState(null);
  const [analyticsView, setAnalyticsView] = useState('max1rm');
  const [historyFilter, setHistoryFilter] = useState('6months');
  const [analyticsFilter, setAnalyticsFilter] = useState('6months');
  const [selectedAnalyticsExercise, setSelectedAnalyticsExercise] = useState('');

  // Check auth session on mount & subscribe to changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch data from Supabase whenever user session is active
  useEffect(() => {
    if (session) {
      fetchCloudData();
    }
  }, [session]);

  const fetchCloudData = async () => {
    try {
      const { data: dbWorkouts, error: wError } = await supabase
        .from('workouts')
        .select('*')
        .order('date', { ascending: false });
      if (wError) console.error('Error fetching workouts:', wError);
      else if (dbWorkouts) setWorkouts(dbWorkouts);

      const { data: dbExercises, error: eError } = await supabase
        .from('exercises')
        .select('*');
      if (eError) console.error('Error fetching exercises:', eError);
      else if (dbExercises && dbExercises.length > 0) setExercises(dbExercises);
    } catch (err) {
      console.error('Supabase connection error:', err);
    }
  };

  // Auth Handlers
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });
      if (error) setAuthError(error.message);
      else alert('Check your email for the confirmation link!');
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) setAuthError(error.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setWorkouts([]);
    setCurrentWorkout(null);
    localStorage.removeItem('repspec_current_workout');
  };

  // Save current active workout locally so active session isn't lost on refresh
  useEffect(() => {
    if (currentWorkout) {
      localStorage.setItem('repspec_current_workout', JSON.stringify(currentWorkout));
    } else {
      localStorage.removeItem('repspec_current_workout');
    }
  }, [currentWorkout]);

  // Set default analytics exercise
  useEffect(() => {
    if (exercises.length > 0 && !selectedAnalyticsExercise) {
      setSelectedAnalyticsExercise(exercises[0].name);
    }
  }, [exercises, selectedAnalyticsExercise]);

  const getLocalDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const calculate1RM = (weight, reps) => {
    if (!weight || !reps || reps <= 0 || weight < 0) return 0;
    if (reps > 10) return null;
    if (reps === 1) return Number(weight);
    return Math.round(weight * (1 + reps / 30));
  };

  const startNewWorkout = () => {
    setCurrentWorkout({
      id: Date.now(),
      date: getLocalDate(),
      name: 'Strength Session',
      exercises: []
    });
  };

  const handleAddExerciseToWorkout = async (exerciseName, muscleGroup) => {
    if (!currentWorkout || !exerciseName.trim()) return;

    let targetExercise = exercises.find(e => e.name.toLowerCase() === exerciseName.toLowerCase());

    if (!targetExercise) {
      const newEx = { 
        id: Date.now(), 
        name: exerciseName, 
        muscleGroup,
        user_id: session?.user?.id 
      };
      setExercises([...exercises, newEx]);
      
      await supabase.from('exercises').insert([newEx]);
    }

    const newExSession = {
      id: Date.now(),
      name: exerciseName,
      muscleGroup: muscleGroup,
      sets: []
    };
    
    setCurrentWorkout({
      ...currentWorkout,
      exercises: [...currentWorkout.exercises, newExSession]
    });
    
    setShowAddExercise(false);
  };

  const handleAddSet = (exerciseId, weight, reps, equipmentType, workingSet, notes) => {
    if (!currentWorkout) return;
    const numWeight = Number(weight) || 0;
    const numReps = Number(reps) || 0;

    if (numReps <= 0 || numWeight < 0) return;

    const updatedExercises = currentWorkout.exercises.map(ex => {
      if (ex.id === exerciseId) {
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              id: Date.now(),
              equipmentType: equipmentType.trim() || 'Barbell',
              weight: numWeight,
              reps: numReps,
              workingSet: workingSet,
              notes: notes.trim()
            }
          ]
        };
      }
      return ex;
    });

    setCurrentWorkout({ ...currentWorkout, exercises: updatedExercises });
    setActiveLoggingExerciseId(null);
  };

  const finishWorkout = async () => {
    if (!currentWorkout) return;
    const hasValidData = currentWorkout.exercises.some(ex => ex.sets.length > 0);
    if (!hasValidData) {
      alert("Cannot save an empty workout. Add at least one set.");
      return;
    }

    const payload = {
      ...currentWorkout,
      user_id: session?.user?.id
    };

    const { error } = await supabase.from('workouts').insert([payload]);
    if (error) {
      console.error('Error saving workout to cloud:', error);
      alert('Failed to save workout to cloud.');
      return;
    }

    setWorkouts([payload, ...workouts]);
    setCurrentWorkout(null);
    localStorage.removeItem('repspec_current_workout');
  };

  const filterByTimeframe = (dateStr, timeframe) => {
    const itemDate = new Date(dateStr);
    const now = new Date();
    const monthsBack = timeframe === '1month' ? 1 : timeframe === '3months' ? 3 : 6;
    now.setMonth(now.getMonth() - monthsBack);
    return itemDate >= now;
  };

  const getTotalStats = () => {
    let totalSets = 0;
    let totalVolume = 0;
    workouts.filter(w => filterByTimeframe(w.date, analyticsFilter)).forEach(w => {
      w.exercises.forEach(e => {
        e.sets.forEach(s => {
          if (s.workingSet && s.weight >= 0 && s.reps > 0) {
            totalSets++;
            totalVolume += (s.weight * s.reps);
          }
        });
      });
    });
    return { totalSets, totalVolume };
  };

  const getChartData = () => {
    if (!selectedAnalyticsExercise) return [];

    return workouts
      .filter(w => filterByTimeframe(w.date, analyticsFilter))
      .map(w => {
        let session1RMs = [];
        w.exercises.forEach(e => {
          if (e.name.toLowerCase() === selectedAnalyticsExercise.toLowerCase()) {
            e.sets.forEach(s => {
              if (s.workingSet) {
                const val = calculate1RM(s.weight, s.reps);
                if (val !== null && val >= 0) session1RMs.push(val);
              }
            });
          }
        });

        if (session1RMs.length === 0) return null;

        const val = analyticsView === 'max1rm' 
          ? Math.max(...session1RMs) 
          : Math.round(session1RMs.reduce((a, b) => a + b, 0) / session1RMs.length);

        return {
          date: w.date,
          score: val
        };
      })
      .filter(Boolean)
      .reverse();
  };

  // Render Login/Signup View if no active session
  if (!session) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-blue-600/20 text-blue-400 rounded-xl flex items-center justify-center mx-auto border border-blue-500/30">
              <Lock size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">REPSPEC</h1>
            <p className="text-xs text-gray-400">Sign in to sync your workouts privately</p>
          </div>

          {authError && (
            <div className="bg-red-950/60 border border-red-800 text-red-300 text-xs p-3 rounded-lg text-center">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Email</label>
              <input 
                type="email" 
                required 
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-white placeholder-gray-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Password</label>
              <input 
                type="password" 
                required 
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-white placeholder-gray-500"
              />
            </div>

            <button 
              type="submit" 
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium text-sm transition-colors text-white"
            >
              {isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="text-center">
            <button 
              onClick={() => {
                setIsSignUp(!isSignUp);
                setAuthError('');
              }}
              className="text-xs text-blue-400 hover:underline"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderWorkoutTab = () => (
    <div className="p-4 max-w-md mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-blue-400">REPSPEC</h1>
          <p className="text-[10px] text-gray-400">{session.user.email}</p>
        </div>
        <div className="flex items-center space-x-2">
          {currentWorkout && (
            <button 
              onClick={finishWorkout}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-xs font-semibold rounded-lg text-white transition-colors"
            >
              Finish
            </button>
          )}
          <button 
            onClick={handleLogout}
            title="Sign Out"
            className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {currentWorkout ? (
        <div className="space-y-4">
          <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-lg">{currentWorkout.name}</h2>
              <p className="text-xs text-gray-400">{currentWorkout.date}</p>
            </div>
            <button 
              onClick={() => {
                if (window.confirm("Discard current workout?")) {
                  setCurrentWorkout(null);
                  localStorage.removeItem('repspec_current_workout');
                }
              }}
              className="text-gray-500 hover:text-red-400 p-1"
            >
              <Trash2 size={16} />
            </button>
          </div>

          {currentWorkout.exercises.map(exercise => {
            const isLoggingThis = activeLoggingExerciseId === exercise.id;

            return (
              <div key={exercise.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700 space-y-3">
                <div className="flex justify-between items-center pb-1 border-b border-gray-700/60">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-semibold text-white text-base">{exercise.name}</h3>
                    <span className="text-[10px] bg-gray-700 px-2 py-0.5 rounded text-gray-300 uppercase tracking-wider">
                      {exercise.muscleGroup}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 font-mono">
                    {exercise.sets.length} {exercise.sets.length === 1 ? 'set' : 'sets'}
                  </span>
                </div>

                <div className="space-y-2">
                  {exercise.sets.length === 0 ? (
                    <p className="text-xs text-gray-500 italic py-1">No sets logged yet.</p>
                  ) : (
                    exercise.sets.map((set, index) => (
                      <div key={set.id} className="flex items-center justify-between bg-gray-900/60 p-2.5 rounded-lg text-sm">
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-500 text-xs font-mono">#{index + 1}</span>
                          {set.equipmentType && (
                            <span className="text-[10px] uppercase bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded font-mono">
                              {set.equipmentType}
                            </span>
                          )}
                          <span className="font-mono font-medium">{set.weight} lbs</span>
                          <span className="text-gray-500">×</span>
                          <span className="font-mono font-medium">{set.reps}</span>
                          {set.notes && <span className="text-xs text-gray-400 italic">"{set.notes}"</span>}
                        </div>
                        <span className={`w-2.5 h-2.5 rounded-full ${set.workingSet ? 'bg-blue-500' : 'bg-gray-600'}`} title={set.workingSet ? 'Working Set' : 'Warmup/Drop Set'} />
                      </div>
                    ))
                  )}
                </div>

                {isLoggingThis ? (
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.target);
                    handleAddSet(
                      exercise.id,
                      data.get('weight'), 
                      data.get('reps'), 
                      data.get('equipmentType'),
                      data.get('workingSet') === 'on', 
                      data.get('notes')
                    );
                  }} className="bg-gray-900/80 p-3 rounded-xl border border-blue-500/40 space-y-3 mt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-blue-400">Log Set for {exercise.name}</span>
                      <button 
                        type="button" 
                        onClick={() => setActiveLoggingExerciseId(null)} 
                        className="text-gray-400 hover:text-white"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div>
                      <label className="text-[10px] text-gray-400 block mb-1">Equipment / Style</label>
                      <input 
                        name="equipmentType" 
                        list="equipment-suggestions"
                        placeholder="e.g., Barbell, Dumbbell, Machine" 
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 text-white placeholder-gray-500"
                      />
                      <datalist id="equipment-suggestions">
                        <option value="Barbell" />
                        <option value="Dumbbell" />
                        <option value="Machine" />
                        <option value="Bodyweight" />
                        <option value="Cable" />
                        <option value="Smith Machine" />
                      </datalist>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-1">Weight (lbs)</label>
                        <input 
                          name="weight" 
                          type="number" 
                          step="any"
                          min="0"
                          required 
                          placeholder="135" 
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-blue-500 text-white placeholder-gray-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-1">Reps</label>
                        <input 
                          name="reps" 
                          type="number" 
                          min="1"
                          required 
                          placeholder="8" 
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-blue-500 text-white placeholder-gray-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-gray-400 block mb-1">Notes (Optional)</label>
                      <input 
                        name="notes" 
                        placeholder="e.g., Felt easy" 
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 text-white placeholder-gray-500"
                      />
                    </div>

                    <div className="flex items-center space-x-2 pt-1">
                      <input 
                        name="workingSet" 
                        type="checkbox" 
                        defaultChecked 
                        id={`workingSet-${exercise.id}`} 
                        className="w-3.5 h-3.5 accent-blue-600 rounded bg-gray-800 border-gray-700"
                      />
                      <label htmlFor={`workingSet-${exercise.id}`} className="text-[10px] text-gray-300">Working Set (Include in 1RM analytics)</label>
                    </div>

                    <button type="submit" className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium text-xs transition-colors text-white">
                      Save Set
                    </button>
                  </form>
                ) : (
                  <button 
                    onClick={() => setActiveLoggingExerciseId(exercise.id)}
                    className="w-full py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-semibold rounded-lg flex items-center justify-center transition-colors"
                  >
                    <Plus size={14} className="mr-1.5" /> Log Set
                  </button>
                )}
              </div>
            );
          })}

          <button 
            onClick={() => setShowAddExercise(true)}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium text-sm flex items-center justify-center transition-colors shadow-lg shadow-blue-900/20"
          >
            <Plus size={18} className="mr-2" /> Add Exercise
          </button>
        </div>
      ) : (
        <div className="text-center py-20 space-y-4">
          <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto text-blue-500">
            <Dumbbell size={32} />
          </div>
          <div>
            <h2 className="text-lg font-bold">Ready to lift?</h2>
            <p className="text-sm text-gray-400">Start an empty session and sync to your account.</p>
          </div>
          <button 
            onClick={startNewWorkout}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium text-sm text-white shadow-lg shadow-blue-900/20 transition-colors"
          >
            Start Workout
          </button>
        </div>
      )}
    </div>
  );

  const renderHistoryTab = () => {
    const filteredWorkouts = workouts.filter(w => filterByTimeframe(w.date, historyFilter));

    return (
      <div className="p-4 max-w-md mx-auto space-y-4">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-xl font-bold">History</h1>
          <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg text-xs">
            {[
              { label: '1M', val: '1month' },
              { label: '3M', val: '3months' },
              { label: '6M', val: '6months' }
            ].map(f => (
              <button 
                key={f.val}
                onClick={() => setHistoryFilter(f.val)}
                className={`px-2.5 py-1 rounded-md transition-colors ${historyFilter === f.val ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredWorkouts.length === 0 ? (
          <p className="text-center text-gray-500 py-10 text-sm">No workout history found for this account.</p>
        ) : (
          filteredWorkouts.map(w => (
            <div key={w.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-semibold">{w.name}</span>
                <span className="text-gray-400 text-xs">{w.date}</span>
              </div>
              <div className="space-y-1 pt-1 border-t border-gray-700/50">
                {w.exercises.map(e => {
                  const workingSets = e.sets.filter(s => s.workingSet && s.reps <= 10);
                  const best1RM = workingSets.length > 0 ? Math.max(...workingSets.map(s => calculate1RM(s.weight, s.reps))) : 0;
                  return (
                    <div key={e.id} className="flex justify-between text-xs py-1">
                      <span className="text-gray-300">{e.name} ({e.sets.length} sets)</span>
                      <span className="font-mono text-blue-400">{best1RM >= 0 ? `${best1RM} lbs 1RM` : 'N/A (>10 reps)'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const renderAnalyticsTab = () => {
    const stats = getTotalStats();
    const chartData = getChartData();

    return (
      <div className="p-4 max-w-md mx-auto space-y-4">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-xl font-bold">Analytics</h1>
          <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg text-xs">
            {[
              { label: '1M', val: '1month' },
              { label: '3M', val: '3months' },
              { label: '6M', val: '6months' }
            ].map(f => (
              <button 
                key={f.val}
                onClick={() => setAnalyticsFilter(f.val)}
                className={`px-2.5 py-1 rounded-md transition-colors ${analyticsFilter === f.val ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 p-3.5 rounded-xl border border-gray-700">
            <div className="flex items-center space-x-2 text-gray-400 text-xs mb-1">
              <BarChart3 size={14} className="text-blue-500" />
              <span>Working Sets</span>
            </div>
            <p className="text-xl font-bold font-mono">{stats.totalSets}</p>
          </div>
          <div className="bg-gray-800 p-3.5 rounded-xl border border-gray-700">
            <div className="flex items-center space-x-2 text-gray-400 text-xs mb-1">
              <Activity size={14} className="text-green-500" />
              <span>Total Volume</span>
            </div>
            <p className="text-xl font-bold font-mono">{stats.totalVolume.toLocaleString()} <span className="text-xs font-normal text-gray-400">lbs</span></p>
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 space-y-3">
          <div className="flex flex-col space-y-2 sm:flex-row sm:justify-between sm:items-center">
            <h2 className="text-sm font-semibold">Estimated 1RM Curve</h2>
            <div className="flex space-x-1 bg-gray-900 p-1 rounded-lg text-xs">
              <button 
                onClick={() => setAnalyticsView('max1rm')}
                className={`px-2 py-1 rounded-md transition-colors ${analyticsView === 'max1rm' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
              >
                Max
              </button>
              <button 
                onClick={() => setAnalyticsView('avg1rm')}
                className={`px-2 py-1 rounded-md transition-colors ${analyticsView === 'avg1rm' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
              >
                Avg
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Select Exercise for Chart</label>
            <select 
              value={selectedAnalyticsExercise}
              onChange={(e) => setSelectedAnalyticsExercise(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 text-white"
            >
              {exercises.map(ex => (
                <option key={ex.id} value={ex.name}>{ex.name}</option>
              ))}
            </select>
          </div>

          <div className="h-48 w-full pt-2">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-gray-500 text-center px-4">
                No working sets (≤ 10 reps) found for {selectedAnalyticsExercise} in this window.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} />
                  <YAxis stroke="#9ca3af" fontSize={10} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '8px', fontSize: '12px' }} />
                  <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="text-[10px] text-gray-500 text-center">Note: Sets above 10 reps are excluded for Epley formula accuracy.</p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-20">
      {activeTab === 'workout' && renderWorkoutTab()}
      {activeTab === 'history' && renderHistoryTab()}
      {activeTab === 'analytics' && renderAnalyticsTab()}

      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 py-2 px-6 flex justify-around items-center max-w-md mx-auto z-40">
        <button 
          onClick={() => setActiveTab('workout')}
          className={`flex flex-col items-center space-y-1 ${activeTab === 'workout' ? 'text-blue-500' : 'text-gray-400'}`}
        >
          <Dumbbell size={20} />
          <span className="text-[10px]">Workout</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center space-y-1 ${activeTab === 'history' ? 'text-blue-500' : 'text-gray-400'}`}
        >
          <Calendar size={20} />
          <span className="text-[10px]">History</span>
        </button>
        <button 
          onClick={() => setActiveTab('analytics')}
          className={`flex flex-col items-center space-y-1 ${activeTab === 'analytics' ? 'text-blue-500' : 'text-gray-400'}`}
        >
          <BarChart3 size={20} />
          <span className="text-[10px]">Analytics</span>
        </button>
      </div>

      {showAddExercise && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">Add Exercise</h3>
              <button onClick={() => setShowAddExercise(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.target);
              handleAddExerciseToWorkout(data.get('name'), data.get('muscleGroup'));
            }} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Exercise Name</label>
                <input 
                  name="name" 
                  required 
                  list="exercise-suggestions"
                  placeholder="e.g., Incline Dumbbell Press" 
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-white placeholder-gray-500"
                />
                <datalist id="exercise-suggestions">
                  {exercises.map(ex => <option key={ex.id} value={ex.name} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Muscle Group Tag</label>
                <select 
                  name="muscleGroup" 
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-white"
                >
                  <option value="Chest">Chest</option>
                  <option value="Back">Back</option>
                  <option value="Legs">Legs</option>
                  <option value="Shoulders">Shoulders</option>
                  <option value="Arms">Arms</option>
                  <option value="Core">Core</option>
                  <option value="Cardio/Other">Cardio / Other</option>
                </select>
              </div>
              <button type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium text-sm transition-colors">
                Add to Workout
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;