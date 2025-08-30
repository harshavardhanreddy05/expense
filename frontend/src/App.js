import React, { useState, useEffect, createContext, useContext } from "react";
import "./App.css";
import axios from "axios";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
} from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const userData = localStorage.getItem('user');
      if (userData) {
        setUser(JSON.parse(userData));
      }
    }
    setLoading(false);
  }, [token]);

  const login = async (username, password) => {
    try {
      const response = await axios.post(`${API}/auth/login`, { username, password });
      const { token: newToken, user: userData } = response.data;
      
      setToken(newToken);
      setUser(userData);
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Login failed' };
    }
  };

  const register = async (username, password, email = '') => {
    try {
      const response = await axios.post(`${API}/auth/register`, { username, password, email });
      const { token: newToken, user: userData } = response.data;
      
      setToken(newToken);
      setUser(userData);
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Registration failed' };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
  };

  const value = { user, token, login, register, logout, loading };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const useAuth = () => useContext(AuthContext);

// Login/Register Component
const AuthForm = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ username: '', password: '', email: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = isLogin 
      ? await login(formData.username, formData.password)
      : await register(formData.username, formData.password, formData.email);

    if (!result.success) {
      setError(result.error);
    }
    setLoading(false);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">💰 ExpenseTracker</h1>
          <p className="text-gray-600">Advanced financial management</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              required
            />
          </div>

          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email (Optional)</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
          >
            {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Notification Component
const NotificationBell = () => {
  const [alerts, setAlerts] = useState([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchAlerts = async () => {
    try {
      const response = await axios.get(`${API}/budgets/alerts`);
      setAlerts(response.data);
      setUnreadCount(response.data.filter(alert => !alert.is_read).length);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  };

  const markAsRead = async (alertId) => {
    try {
      await axios.put(`${API}/budgets/alerts/${alertId}/read`);
      fetchAlerts();
    } catch (error) {
      console.error('Error marking alert as read:', error);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setShowAlerts(!showAlerts)}
        className="relative p-2 text-gray-600 hover:text-gray-800 transition"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {showAlerts && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50 max-h-96 overflow-y-auto">
          <div className="p-4 border-b">
            <h3 className="font-medium text-gray-900">Budget Alerts</h3>
          </div>
          {alerts.length === 0 ? (
            <div className="p-4 text-center text-gray-500">No alerts</div>
          ) : (
            <div className="divide-y">
              {alerts.slice(0, 10).map(alert => (
                <div
                  key={alert.id}
                  className={`p-4 hover:bg-gray-50 cursor-pointer ${!alert.is_read ? 'bg-blue-50' : ''}`}
                  onClick={() => markAsRead(alert.id)}
                >
                  <div className={`text-sm ${alert.alert_type === 'exceeded' ? 'text-red-600' : 'text-yellow-600'}`}>
                    {alert.alert_type === 'exceeded' ? '🚨' : '⚠️'} {alert.message}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(alert.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Charts Component
const ChartsSection = ({ period, setPeriod }) => {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchChartData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/analytics/charts?period=${period}`);
      setChartData(response.data);
    } catch (error) {
      console.error('Error fetching chart data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChartData();
  }, [period]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse flex space-x-4">
          <div className="rounded-full bg-slate-200 h-10 w-10"></div>
          <div className="flex-1 space-y-6 py-1">
            <div className="h-2 bg-slate-200 rounded"></div>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div className="h-2 bg-slate-200 rounded col-span-2"></div>
                <div className="h-2 bg-slate-200 rounded col-span-1"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!chartData) return null;

  const pieChartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom' },
      title: { display: true, text: 'Expenses by Category' }
    }
  };

  const barChartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Daily Spending Trends' }
    },
    scales: {
      y: { beginAtZero: true }
    }
  };

  const pieChartData = {
    labels: chartData.pie_chart.expenses.labels,
    datasets: [{
      data: chartData.pie_chart.expenses.data,
      backgroundColor: [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
        '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF',
        '#4BC0C0', '#FF6384'
      ]
    }]
  };

  const barChartData = {
    labels: chartData.bar_chart.labels,
    datasets: [
      {
        label: 'Expenses',
        data: chartData.bar_chart.expenses,
        backgroundColor: 'rgba(255, 99, 132, 0.8)'
      },
      {
        label: 'Income',
        data: chartData.bar_chart.income,
        backgroundColor: 'rgba(75, 192, 192, 0.8)'
      }
    ]
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">📈 Visual Analytics</h3>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <Pie data={pieChartData} options={pieChartOptions} />
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <Bar data={barChartData} options={barChartOptions} />
        </div>
      </div>
    </div>
  );
};

// Budget Management Component
const BudgetSection = () => {
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState({ all: [] });
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchBudgets = async () => {
    try {
      const [budgetsRes, categoriesRes] = await Promise.all([
        axios.get(`${API}/budgets`),
        axios.get(`${API}/categories`)
      ]);
      setBudgets(budgetsRes.data);
      setCategories(categoriesRes.data);
    } catch (error) {
      console.error('Error fetching budgets:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgets();
  }, []);

  const deleteBudget = async (budgetId) => {
    try {
      await axios.delete(`${API}/budgets/${budgetId}`);
      fetchBudgets();
    } catch (error) {
      console.error('Error deleting budget:', error);
    }
  };

  if (loading) return <div className="bg-white rounded-lg shadow p-6">Loading budgets...</div>;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">💰 Budget Management</h3>
        <button
          onClick={() => setShowAddBudget(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Add Budget
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {budgets.length === 0 ? (
          <div className="col-span-full text-center text-gray-500 py-8">
            No budgets set. Create your first budget to track spending limits!
          </div>
        ) : (
          budgets.map(budget => {
            const percentage = (budget.current_spent / budget.limit_amount) * 100;
            const isExceeded = percentage >= 100;
            const isWarning = percentage >= 80;
            
            return (
              <div key={budget.id} className="border rounded-lg p-4 hover:shadow-md transition">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-gray-900">{budget.category}</h4>
                  <button
                    onClick={() => deleteBudget(budget.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    ×
                  </button>
                </div>
                
                <div className="mb-3">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>${budget.current_spent.toFixed(2)} spent</span>
                    <span>${budget.limit_amount.toFixed(2)} limit</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        isExceeded ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    ></div>
                  </div>
                  <div className={`text-xs mt-1 ${
                    isExceeded ? 'text-red-600' : isWarning ? 'text-yellow-600' : 'text-green-600'
                  }`}>
                    {percentage.toFixed(1)}% of budget used
                  </div>
                </div>
                
                <div className="text-xs text-gray-500">
                  {budget.period} • {budget.start_date} to {budget.end_date}
                </div>
              </div>
            );
          })
        )}
      </div>

      {showAddBudget && (
        <AddBudgetModal
          categories={categories}
          onClose={() => setShowAddBudget(false)}
          onSuccess={() => {
            fetchBudgets();
            setShowAddBudget(false);
          }}
        />
      )}
    </div>
  );
};

// Add Budget Modal
const AddBudgetModal = ({ categories, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    category: '',
    limit_amount: '',
    period: 'monthly'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await axios.post(`${API}/budgets`, {
        ...formData,
        limit_amount: parseFloat(formData.limit_amount)
      });
      onSuccess();
    } catch (error) {
      setError(error.response?.data?.detail || 'Failed to create budget');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Set Budget Limit</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({...formData, category: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">Select Category</option>
              {categories.all.map(cat => (
                <option key={cat.name} value={cat.name}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Budget Limit ($)</label>
            <input
              type="number"
              step="0.01"
              value={formData.limit_amount}
              onChange={(e) => setFormData({...formData, limit_amount: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
            <select
              value={formData.period}
              onChange={(e) => setFormData({...formData, period: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Enhanced Category Management
const CategorySection = () => {
  const [categories, setCategories] = useState({ predefined: [], custom: [], all: [] });
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API}/categories`);
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const updateCategory = async (categoryId, data) => {
    try {
      await axios.put(`${API}/categories/${categoryId}`, data);
      fetchCategories();
      setEditingCategory(null);
    } catch (error) {
      console.error('Error updating category:', error);
    }
  };

  if (loading) return <div className="bg-white rounded-lg shadow p-6">Loading categories...</div>;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">🏷️ Category Management</h3>
        <button
          onClick={() => setShowAddCategory(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
        >
          Add Category
        </button>
      </div>

      <div className="space-y-6">
        <div>
          <h4 className="font-medium text-gray-900 mb-3">Predefined Categories</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {categories.predefined.map(cat => (
              <div key={cat.name} className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl mb-1">{cat.icon}</div>
                <div className="text-xs text-gray-600">{cat.name}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-medium text-gray-900 mb-3">Custom Categories</h4>
          {categories.custom.length === 0 ? (
            <div className="text-center text-gray-500 py-4">
              No custom categories yet. Add one to get started!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categories.custom.map(cat => (
                <div key={cat.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{cat.icon}</span>
                      <div>
                        <div className="font-medium">{cat.name}</div>
                        {cat.goal && (
                          <div className="text-sm text-gray-600">
                            Goal: ${cat.goal.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setEditingCategory(cat)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAddCategory && (
        <CategoryModal
          onClose={() => setShowAddCategory(false)}
          onSuccess={() => {
            fetchCategories();
            setShowAddCategory(false);
          }}
        />
      )}

      {editingCategory && (
        <CategoryModal
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
          onSuccess={() => {
            fetchCategories();
            setEditingCategory(null);
          }}
        />
      )}
    </div>
  );
};

// Category Modal Component
const CategoryModal = ({ category = null, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: category?.name || '',
    icon: category?.icon || '📦',
    goal: category?.goal || ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const commonIcons = ['📦', '🍽️', '🚗', '💡', '🛍️', '🏥', '🎬', '✈️', '📚', '🛡️', '⚽', '🎮', '🏠', '💄', '🔧'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = {
        ...formData,
        goal: formData.goal ? parseFloat(formData.goal) : null
      };

      if (category) {
        await axios.put(`${API}/categories/${category.id}`, data);
      } else {
        await axios.post(`${API}/categories`, data);
      }
      onSuccess();
    } catch (error) {
      setError(error.response?.data?.detail || 'Failed to save category');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {category ? 'Edit Category' : 'Add Custom Category'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
            <div className="grid grid-cols-5 gap-2 mb-2">
              {commonIcons.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setFormData({...formData, icon})}
                  className={`text-2xl p-2 rounded border-2 transition ${
                    formData.icon === icon ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Or enter custom icon/emoji"
              value={formData.icon}
              onChange={(e) => setFormData({...formData, icon: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monthly Spending Goal (Optional)
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.goal}
              onChange={(e) => setFormData({...formData, goal: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., 500.00"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
            >
              {loading ? 'Saving...' : (category ? 'Update' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Reports Section
const ReportsSection = () => {
  const [period, setPeriod] = useState('month');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/reports/summary?period=${period}`);
      setReportData(response.data);
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportData = async (format) => {
    try {
      const response = await axios.get(`${API}/reports/export?format=${format}&period=${period}`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], {
        type: format === 'csv' ? 'text/csv' : 'application/json'
      });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `expense_report_${period}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting data:', error);
    }
  };

  useEffect(() => {
    generateReport();
  }, [period]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">📅 Advanced Reports</h3>
        <div className="flex space-x-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
          <button
            onClick={() => exportData('csv')}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm"
          >
            Export CSV
          </button>
          <button
            onClick={() => exportData('json')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm"
          >
            Export JSON
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Generating report...</p>
        </div>
      ) : reportData ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-green-50 rounded-lg p-4 text-center border-l-4 border-green-500">
              <div className="text-2xl font-bold text-green-600">
                ${reportData.summary.total_income.toFixed(2)}
              </div>
              <div className="text-sm text-gray-600">Total Income</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4 text-center border-l-4 border-red-500">
              <div className="text-2xl font-bold text-red-600">
                ${reportData.summary.total_expenses.toFixed(2)}
              </div>
              <div className="text-sm text-gray-600">Total Expenses</div>
            </div>
            <div className={`${reportData.summary.net_balance >= 0 ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'} rounded-lg p-4 text-center border-l-4`}>
              <div className={`text-2xl font-bold ${reportData.summary.net_balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${reportData.summary.net_balance.toFixed(2)}
              </div>
              <div className="text-sm text-gray-600">Net Balance</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center border-l-4 border-blue-500">
              <div className="text-2xl font-bold text-blue-600">
                {reportData.summary.total_transactions}
              </div>
              <div className="text-sm text-gray-600">Transactions</div>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-4">Top Expense Categories</h4>
            <div className="space-y-2">
              {reportData.top_expense_categories.slice(0, 5).map(([category, amount], index) => (
                <div key={category} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="font-medium">#{index + 1} {category}</span>
                  <span className="text-red-600 font-bold">${amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-500 text-center">
            Report generated on: {new Date(reportData.generated_at).toLocaleString()}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          No data available for the selected period.
        </div>
      )}
    </div>
  );
};

// Main Dashboard Component
const Dashboard = () => {
  const { user, logout } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState({ predefined: [], custom: [], all: [] });
  const [summary, setSummary] = useState({});
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [filter, setFilter] = useState({ category: '', type: '' });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod] = useState('month');

  const fetchExpenses = async () => {
    try {
      const params = new URLSearchParams();
      if (filter.category) params.append('category', filter.category);
      if (filter.type) params.append('type', filter.type);
      
      const response = await axios.get(`${API}/expenses?${params}`);
      setExpenses(response.data);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API}/categories`);
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await axios.get(`${API}/analytics/summary?period=${period}`);
      setSummary(response.data);
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchExpenses(), fetchCategories(), fetchSummary()]);
      setLoading(false);
    };
    loadData();
  }, [filter, period]);

  const handleDeleteExpense = async (expenseId) => {
    try {
      await axios.delete(`${API}/expenses/${expenseId}`);
      fetchExpenses();
      fetchSummary();
    } catch (error) {
      console.error('Error deleting expense:', error);
    }
  };

  const refreshAllData = () => {
    fetchExpenses();
    fetchCategories();
    fetchSummary();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your financial dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">💰 ExpenseTracker Pro</h1>
              <p className="text-gray-600">Welcome back, {user.username}!</p>
            </div>
            <div className="flex items-center space-x-4">
              <NotificationBell />
              <button
                onClick={() => setShowAddExpense(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Add Transaction
              </button>
              <button
                onClick={logout}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', name: '📊 Overview', icon: '📊' },
              { id: 'analytics', name: '📈 Analytics', icon: '📈' },
              { id: 'budgets', name: '💰 Budgets', icon: '💰' },
              { id: 'categories', name: '🏷️ Categories', icon: '🏷️' },
              { id: 'reports', name: '📅 Reports', icon: '📅' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="stats-card-income rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Total Income</h3>
                <p className="text-3xl font-bold text-green-600">${summary.total_income?.toFixed(2) || '0.00'}</p>
              </div>
              <div className="stats-card-expense rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Total Expenses</h3>
                <p className="text-3xl font-bold text-red-600">${summary.total_expenses?.toFixed(2) || '0.00'}</p>
              </div>
              <div className="stats-card-balance rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Balance</h3>
                <p className={`text-3xl font-bold ${summary.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${summary.balance?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className="stats-card-transactions rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Transactions</h3>
                <p className="text-3xl font-bold text-blue-600">{summary.transaction_count || 0}</p>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Filters & Period</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Period</label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="year">This Year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                  <select
                    value={filter.category}
                    onChange={(e) => setFilter({...filter, category: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Categories</option>
                    {categories.all.map(cat => (
                      <option key={cat.name} value={cat.name}>{cat.icon} {cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                  <select
                    value={filter.type}
                    onChange={(e) => setFilter({...filter, type: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Types</option>
                    <option value="expense">Expenses</option>
                    <option value="income">Income</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Expenses List */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Recent Transactions</h3>
              </div>
              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {expenses.length > 0 ? expenses.map(expense => (
                  <div key={expense.id} className="px-6 py-4 flex justify-between items-center">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-medium text-gray-900">{expense.title}</h4>
                        <span className={`text-xl font-bold ${expense.type === 'expense' ? 'text-red-600' : 'text-green-600'}`}>
                          {expense.type === 'expense' ? '-' : '+'}${expense.amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                        <span className="category-pill">
                          {categories.all.find(cat => cat.name === expense.category)?.icon || '📦'} {expense.category}
                        </span>
                        <span>{expense.date}</span>
                        {expense.description && <span>{expense.description}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteExpense(expense.id)}
                      className="ml-4 text-red-600 hover:text-red-800 transition"
                    >
                      Delete
                    </button>
                  </div>
                )) : (
                  <div className="px-6 py-8 text-center text-gray-500">
                    No transactions found. Add your first expense to get started!
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && <ChartsSection period={period} setPeriod={setPeriod} />}
        {activeTab === 'budgets' && <BudgetSection />}
        {activeTab === 'categories' && <CategorySection />}
        {activeTab === 'reports' && <ReportsSection />}
      </div>

      {/* Add Expense Modal */}
      {showAddExpense && (
        <AddExpenseModal
          categories={categories}
          onClose={() => setShowAddExpense(false)}
          onSuccess={() => {
            refreshAllData();
            setShowAddExpense(false);
          }}
        />
      )}
    </div>
  );
};

// Enhanced Add Expense Modal
const AddExpenseModal = ({ categories, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    category: '',
    type: 'expense',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [newCategory, setNewCategory] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Add new category if needed
      if (newCategory.trim()) {
        await axios.post(`${API}/categories`, { name: newCategory.trim() });
        formData.category = newCategory.trim();
      }

      // Add expense
      await axios.post(`${API}/expenses`, {
        ...formData,
        amount: parseFloat(formData.amount)
      });

      onSuccess();
    } catch (error) {
      setError(error.response?.data?.detail || 'Failed to add expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 modal-backdrop">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Add Transaction</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="expense">💸 Expense</option>
                <option value="income">💰 Income</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-gray-700">Category</label>
              <button
                type="button"
                onClick={() => setShowNewCategory(!showNewCategory)}
                className="text-blue-600 text-sm hover:text-blue-700"
              >
                + New Category
              </button>
            </div>
            {!showNewCategory ? (
              <select
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select Category</option>
                {categories.all.map(cat => (
                  <option key={cat.name} value={cat.name}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="Enter new category name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm slide-down">
              {error}
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Main App Component
function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading ExpenseTracker Pro...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      {user ? <Dashboard /> : <AuthForm />}
    </div>
  );
}

// Export wrapped App
export default function AppWithAuth() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}