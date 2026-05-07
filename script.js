// *** API Keys - REPLACE WITH YOUR ACTUAL KEYS ***
// For local development, replace with your keys
// For production, use environment variables or config.js
const OPENWEATHER_API_KEY = window.CONFIG?.OPENWEATHER_API_KEY || 'your_openweather_api_key_here';
const IQAIR_API_KEY = window.CONFIG?.IQAIR_API_KEY || 'your_iqair_api_key_here'; 

// Global variables
let speechEnabled = false;
let speechSynth = window.speechSynthesis;
let currentUtterance = null;
let factIntervalId = null;
let deferredPrompt = null;
let historicalData = [];
let currentChart = null;

// Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed:', err));
    });
}

// PWA Install Prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installPrompt').style.display = 'flex';
});

function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
            }
            deferredPrompt = null;
            document.getElementById('installPrompt').style.display = 'none';
        });
    }
}

function dismissInstall() {
    document.getElementById('installPrompt').style.display = 'none';
}

// Load historical data from localStorage
function loadHistoricalData() {
    const stored = localStorage.getItem('riskHistory');
    if (stored) {
        historicalData = JSON.parse(stored);
        updateQuickStats();
    }
}

// Save to historical data
function saveToHistory(data) {
    const entry = {
        ...data,
        timestamp: new Date().toISOString(),
        id: Date.now()
    };
    
    historicalData.unshift(entry);
    
    // Keep only last 50 entries
    if (historicalData.length > 50) {
        historicalData = historicalData.slice(0, 50);
    }
    
    localStorage.setItem('riskHistory', JSON.stringify(historicalData));
    updateQuickStats();
}

// Update quick stats
function updateQuickStats() {
    if (historicalData.length === 0) return;
    
    document.getElementById('quickStats').style.display = 'grid';
    
    const avgRisk = historicalData.reduce((sum, entry) => sum + entry.riskLevel, 0) / historicalData.length;
    document.getElementById('avgRisk').textContent = (avgRisk * 100).toFixed(1) + '%';
    document.getElementById('totalSearches').textContent = historicalData.length;
    
    const lastEntry = historicalData[0];
    const lastTime = new Date(lastEntry.timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now - lastTime) / 60000);
    
    let timeText = '';
    if (diffMinutes < 1) timeText = 'Just now';
    else if (diffMinutes < 60) timeText = diffMinutes + 'm ago';
    else if (diffMinutes < 1440) timeText = Math.floor(diffMinutes / 60) + 'h ago';
    else timeText = Math.floor(diffMinutes / 1440) + 'd ago';
    
    document.getElementById('lastUpdate').textContent = timeText;
}

// Show historical data modal
function showHistoricalData() {
    if (historicalData.length === 0) {
        alert('No historical data available yet. Perform a risk analysis first.');
        return;
    }
    
    document.getElementById('historicalModal').style.display = 'flex';
    renderHistoricalChart();
    renderHistoricalList();
}

function closeHistoricalModal() {
    document.getElementById('historicalModal').style.display = 'none';
}

// Render historical chart
function renderHistoricalChart() {
    const ctx = document.getElementById('historicalChart').getContext('2d');
    
    if (currentChart) {
        currentChart.destroy();
    }
    
    const labels = historicalData.slice(0, 10).reverse().map(entry => {
        const date = new Date(entry.timestamp);
        return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    });
    
    const riskData = historicalData.slice(0, 10).reverse().map(entry => (entry.riskLevel * 100).toFixed(1));
    const tempData = historicalData.slice(0, 10).reverse().map(entry => entry.temperature);
    const aqiData = historicalData.slice(0, 10).reverse().map(entry => entry.airQuality);
    
    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Risk Level (%)',
                    data: riskData,
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Temperature (°C)',
                    data: tempData,
                    borderColor: 'rgb(251, 191, 36)',
                    backgroundColor: 'rgba(251, 191, 36, 0.1)',
                    tension: 0.4,
                    yAxisID: 'y1'
                },
                {
                    label: 'AQI',
                    data: aqiData,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    yAxisID: 'y2'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Risk Trends (Last 10 Checks)'
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Risk %'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Temperature °C'
                    },
                    grid: {
                        drawOnChartArea: false,
                    }
                },
                y2: {
                    type: 'linear',
                    display: false,
                    position: 'right'
                }
            }
        }
    });
}

// Render historical list
function renderHistoricalList() {
    const listContainer = document.getElementById('historicalList');
    
    const html = historicalData.slice(0, 20).map(entry => {
        const date = new Date(entry.timestamp);
        const riskClass = entry.riskLevel < 0.3 ? 'risk-low' : entry.riskLevel < 0.7 ? 'risk-moderate' : 'risk-high';
        
        return `
            <div class="history-item ${riskClass}">
                <div class="history-header">
                    <strong>${entry.city}, ${entry.state}</strong>
                    <span class="history-time">${date.toLocaleString('en-IN')}</span>
                </div>
                <div class="history-details">
                    <span><i class="fas fa-exclamation-triangle"></i> Risk: ${(entry.riskLevel * 100).toFixed(1)}%</span>
                    <span><i class="fas fa-thermometer-half"></i> ${entry.temperature}°C</span>
                    <span><i class="fas fa-wind"></i> AQI: ${entry.airQuality}</span>
                    <span><i class="fas fa-tint"></i> ${entry.humidity}%</span>
                </div>
            </div>
        `;
    }).join('');
    
    listContainer.innerHTML = html || '<p style="text-align: center; color: var(--text-secondary);">No history available</p>';
}

// Geolocation detection
function detectLocation() {
    const locationBtn = document.querySelector('.location-btn');
    const locationIcon = document.getElementById('location-icon');
    
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }
    
    locationIcon.className = 'fas fa-spinner fa-spin';
    locationBtn.disabled = true;
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            
            try {
                // Reverse geocoding using OpenWeather
                const response = await fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${latitude}&lon=${longitude}&limit=1&appid=${OPENWEATHER_API_KEY}`);
                const data = await response.json();
                
                if (data.length > 0) {
                    const location = data[0];
                    
                    // Try to match with Indian states
                    const matchedState = indianStates.find(state => 
                        location.state && location.state.toLowerCase().includes(state.toLowerCase())
                    ) || location.state || '';
                    
                    document.getElementById('stateInput').value = matchedState;
                    document.getElementById('cityInput').value = location.name || '';
                    
                    showToast(`Location detected: ${location.name}, ${matchedState}`, 'success');
                    speak(`Location detected: ${location.name}, ${matchedState}`);
                    
                    // Auto-trigger analysis
                    setTimeout(() => checkRisk(), 500);
                } else {
                    showToast('Could not determine your location. Please enter manually.', 'warning');
                }
            } catch (error) {
                console.error('Geocoding error:', error);
                showToast('Error detecting location. Please enter manually.', 'error');
            } finally {
                locationIcon.className = 'fas fa-location-crosshairs';
                locationBtn.disabled = false;
            }
        },
        (error) => {
            console.error('Geolocation error:', error);
            let errorMessage = 'Unable to access your location.';
            
            if (error.code === error.PERMISSION_DENIED) {
                errorMessage = 'Location access denied. Please enable location services.';
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                errorMessage = 'Location information unavailable.';
            } else if (error.code === error.TIMEOUT) {
                errorMessage = 'Location request timed out.';
            }
            
            showToast(errorMessage, 'error');
            locationIcon.className = 'fas fa-location-crosshairs';
            locationBtn.disabled = false;
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// Sample data for Indian states and cities (for autocomplete)
const indianStates = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", 
    "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", 
    "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", 
    "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", 
    "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const indianCities = {
    "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Solapur", "Kolhapur"],
    "Karnataka": ["Bangalore", "Mysore", "Mangalore", "Hubli", "Belgaum", "Gulbarga"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Trichy", "Salem", "Tirunelveli"],
    "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar"],
    "Rajasthan": ["Jaipur", "Jodhpur", "Kota", "Bikaner", "Udaipur", "Ajmer"],
    "Uttar Pradesh": ["Lucknow", "Kanpur", "Agra", "Varanasi", "Allahabad", "Meerut"],
    "West Bengal": ["Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri"],
    "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool"],
    "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar"],
    "Kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam"],
    "Punjab": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda"],
    "Haryana": ["Faridabad", "Gurgaon", "Panipat", "Ambala", "Rohtak"],
    "Bihar": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga"],
    "Odisha": ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur"],
    "Assam": ["Guwahati", "Silchar", "Dibrugarh", "Jorhat"],
    "Madhya Pradesh": ["Bhopal", "Indore", "Gwalior", "Jabalpur", "Ujjain"],
    "Chhattisgarh": ["Raipur", "Bhilai", "Korba", "Bilaspur"],
    "Jharkhand": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro"],
    "Uttarakhand": ["Dehradun", "Haridwar", "Roorkee", "Haldwani"],
    "Himachal Pradesh": ["Shimla", "Dharamshala", "Solan", "Mandi"],
    "Goa": ["Panaji", "Margao", "Vasco da Gama", "Mapusa"]
};

// Health facts for loading states
const healthFacts = [
    "Washing hands for 20 seconds can reduce respiratory infections by up to 45%.",
    "Wearing masks can reduce transmission of airborne diseases by 70-80%.",
    "Maintaining 6 feet distance can significantly reduce infection risk.",
    "Proper ventilation can reduce indoor transmission by up to 50%.",
    "Vaccination has prevented over 21 million deaths globally.",
    "Regular exercise boosts immune system significantly.",
    "Adequate sleep strengthens immune response.",
    "Stress reduction can improve immunity.",
    "Vitamin D deficiency increases infection risk.",
    "Hydration helps maintain strong immune barriers."
];

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    detectSystemTheme();
    loadHistoricalData();
});

function initializeApp() {
    // Set up event listeners
    document.addEventListener('click', closeDropdowns);
    
    // Initialize speech synthesis
    if ('speechSynthesis' in window) {
        speechSynth = window.speechSynthesis;
    }
    
    // Initial theme setting (can be overridden by real weather later)
    updateWeatherTheme('default'); 
    
    // Preload some data (simulated)
    preloadData();
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Check for URL parameters
    checkURLParameters();
    
    // Auto-update quick stats every minute
    setInterval(updateQuickStats, 60000);
}

// Keyboard shortcuts
function handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + K: Focus on city input
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('cityInput').focus();
    }
    
    // Ctrl/Cmd + Enter: Analyze risk
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        checkRisk();
    }
    
    // Ctrl/Cmd + H: Show history
    if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        showHistoricalData();
    }
    
    // Ctrl/Cmd + L: Detect location
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        detectLocation();
    }
    
    // Escape: Close modals
    if (e.key === 'Escape') {
        closeHistoricalModal();
    }
}

// Check URL parameters for deep linking
function checkURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const view = urlParams.get('view');
    
    if (view === 'history') {
        setTimeout(() => showHistoricalData(), 500);
    }
    
    const city = urlParams.get('city');
    const state = urlParams.get('state');
    
    if (city && state) {
        document.getElementById('cityInput').value = decodeURIComponent(city);
        document.getElementById('stateInput').value = decodeURIComponent(state);
        setTimeout(() => checkRisk(), 500);
    }
}

// Toggle keyboard shortcuts panel
function toggleShortcuts() {
    const panel = document.getElementById('shortcutsPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// Close shortcuts panel when clicking outside
document.addEventListener('click', (e) => {
    const panel = document.getElementById('shortcutsPanel');
    const btn = document.querySelector('.hint-btn');
    
    if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
        panel.style.display = 'none';
    }
});

// Toast notification system
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-circle' : 
                 type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.4s ease reverse';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 400);
    }, duration);
}

// Enhanced error handling with retry logic
let retryCount = 0;
const MAX_RETRIES = 3;

async function checkRiskWithRetry() {
    try {
        await checkRisk();
        retryCount = 0;
    } catch (error) {
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            showToast(`Retrying... (${retryCount}/${MAX_RETRIES})`, 'warning', 2000);
            setTimeout(checkRiskWithRetry, 2000);
        } else {
            showToast('Maximum retry attempts reached. Please try again later.', 'error', 5000);
            retryCount = 0;
        }
    }
}

// Network status monitoring
window.addEventListener('online', () => {
    showToast('Connection restored! You are back online.', 'success');
});

window.addEventListener('offline', () => {
    showToast('No internet connection. Some features may be limited.', 'warning', 5000);
});

// Performance monitoring
if ('performance' in window) {
    window.addEventListener('load', () => {
        const perfData = performance.getEntriesByType('navigation')[0];
        if (perfData) {
            const loadTime = perfData.loadEventEnd - perfData.loadEventStart;
            console.log(`Page load time: ${loadTime}ms`);
            
            if (loadTime > 3000) {
                console.warn('Slow page load detected');
            }
        }
    });
}

function detectSystemTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('theme-icon').className = 'fas fa-sun';
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    const themeIcon = document.getElementById('theme-icon');
    
    document.documentElement.setAttribute('data-theme', newTheme);
    themeIcon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    
    // Smooth transition effect
    document.body.style.transition = 'all 0.3s ease';
    setTimeout(() => {
        document.body.style.transition = '';
    }, 300);
}

function closeDropdowns() {
    document.getElementById('stateSuggestions').style.display = 'none';
    document.getElementById('suggestions').style.display = 'none';
}

function toggleSpeech() {
    speechEnabled = !speechEnabled;
    const speechIcon = document.getElementById('speech-icon');
    
    if (speechEnabled) {
        speechIcon.className = 'fas fa-volume-up';
        speechIcon.style.color = '#22c55e'; // Green for enabled
        speak("Speech enabled. I will now read important information aloud.");
    } else {
        speechIcon.className = 'fas fa-volume-mute';
        speechIcon.style.color = ''; // Default color
        if (currentUtterance) {
            speechSynth.cancel();
        }
    }
}

function speak(text) {
    if (!speechEnabled || !('speechSynthesis' in window)) return;
    
    if (currentUtterance) {
        speechSynth.cancel();
    }
    
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.rate = 0.8;
    currentUtterance.pitch = 1;
    currentUtterance.volume = 0.8;
    
    // Set language to English (en-US) since language changing functionality is removed
    currentUtterance.lang = 'en-US'; 
    
    speechSynth.speak(currentUtterance);
}

function autocompleteState() {
    const input = document.getElementById('stateInput');
    const suggestionsBox = document.getElementById('stateSuggestions');
    const query = input.value.toLowerCase();
    
    if (query.length < 1) { // Shows suggestions after 1 character
        suggestionsBox.style.display = 'none';
        return;
    }
    
    const matches = indianStates.filter(state => 
        state.toLowerCase().includes(query)
    );
    
    if (matches.length > 0) {
        suggestionsBox.innerHTML = matches.map(state => 
            `<div class="suggestion-item" onclick="selectState('${state}')">
                <i class="fas fa-map-marker-alt"></i> ${state}
            </div>`
        ).join('');
        suggestionsBox.style.display = 'block';
    } else {
        suggestionsBox.style.display = 'none';
    }
}

function selectState(state) {
    document.getElementById('stateInput').value = state;
    document.getElementById('stateSuggestions').style.display = 'none';
    document.getElementById('cityInput').value = '';
    document.getElementById('cityInput').focus();
}

function autocompleteCity() {
    const stateInput = document.getElementById('stateInput').value;
    const cityInput = document.getElementById('cityInput');
    const suggestionsBox = document.getElementById('suggestions');
    const query = cityInput.value.toLowerCase();
    
    if (query.length < 1) { // Shows suggestions after 1 character
        suggestionsBox.style.display = 'none';
        return;
    }
    
    let cities = [];
    if (indianCities[stateInput]) {
        cities = indianCities[stateInput];
    } else {
        // Show all cities if state not selected (could be a very long list)
        cities = Object.values(indianCities).flat();
    }
    
    const matches = cities.filter(city => 
        city.toLowerCase().includes(query)
    );
    
    if (matches.length > 0) {
        suggestionsBox.innerHTML = matches.map(city => 
            `<div class="suggestion-item" onclick="selectCity('${city}')">
                <i class="fas fa-city"></i> ${city}
            </div>`
        ).join('');
        suggestionsBox.style.display = 'block';
    } else {
        suggestionsBox.style.display = 'none';
    }
}

function selectCity(city) {
    document.getElementById('cityInput').value = city;
    document.getElementById('suggestions').style.display = 'none';
}

// Updated function to apply theme based on specific weather conditions or time
function updateWeatherTheme(condition = 'default') {
    const body = document.body;
    // Remove all specific weather themes first
    body.classList.remove('theme-sunny', 'theme-rainy', 'theme-cloudy', 'theme-night'); 
    
    if (condition === 'sunny') {
        body.classList.add('theme-sunny');
    } else if (condition === 'rainy') {
        body.classList.add('theme-rainy');
    } else if (condition === 'cloudy') {
        body.classList.add('theme-cloudy');
    } else {
        // Fallback to time-based theme if no specific weather condition is provided
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 18) { // Day
            body.classList.add('theme-sunny'); // Default day theme
        } else { // Night
            body.classList.add('theme-night');
        }
    }
}


function preloadData() {
    // Simulate data preloading, no changes needed here.
    console.log('Initial data (states/cities) loaded.');
}

async function checkRisk() {
    const state = document.getElementById('stateInput').value;
    const city = document.getElementById('cityInput').value;
    
    if (!state || !city) {
        showToast('Please select both state and city', 'warning');
        return;
    }
    
    showLoading();

    try {
        // 1. Get Coordinates using OpenWeather Geocoding API
        const geoResponse = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${city},${state},IN&limit=1&appid=${OPENWEATHER_API_KEY}`);
        if (!geoResponse.ok) {
            throw new Error(`OpenWeather Geocoding API Error: ${geoResponse.statusText}`);
        }
        const geoData = await geoResponse.json();

        if (geoData.length === 0) {
            throw new Error('Location data not found for the selected city/state. Please check input.');
        }

        const { lat, lon } = geoData[0];

        // 2. Fetch Weather Data from OpenWeather Current Weather API
        const weatherPromise = fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`);

        // 3. Fetch Air Quality Data from IQAir API
        const airQualityPromise = fetch(`https://api.airvisual.com/v2/city?city=${city}&state=${state}&country=India&key=${IQAIR_API_KEY}`);

        // Wait for both API calls to complete
        const [weatherResponse, airQualityResponse] = await Promise.all([weatherPromise, airQualityPromise]);

        // Check responses for success
        if (!weatherResponse.ok) {
            throw new Error(`OpenWeather API Error: ${weatherResponse.statusText}. Check your API key or network.`);
        }
        if (!airQualityResponse.ok) {
            throw new Error(`IQAir API Error: ${airQualityResponse.statusText}. Check your API key or the exact city/state name.`);
        }

        const weatherData = await weatherResponse.json();
        const airQualityData = await airQualityResponse.json();
        
        // Ensure IQAir data structure is as expected
        if (!airQualityData.data || !airQualityData.data.current || !airQualityData.data.current.pollution) {
            throw new Error('Invalid IQAir data received. Could not parse air quality.');
        }

        // Simulate risk calculation based on real data
        const riskLevel = calculateRiskFromData(weatherData, airQualityData);

        // Hide loading and then generate report
        clearTimeout(factIntervalId);
        document.getElementById('loadingContainer').style.display = 'none';

        // Save to history
        saveToHistory({
            state,
            city,
            riskLevel,
            temperature: weatherData.main.temp,
            humidity: weatherData.main.humidity,
            airQuality: airQualityData.data.current.pollution.aqius,
            visibility: weatherData.visibility / 1000,
            pressure: weatherData.main.pressure
        });

        generateRiskReport(state, city, weatherData, airQualityData, riskLevel);
        
        showToast('Risk analysis completed successfully!', 'success');

    } catch (error) {
        console.error("Error fetching data:", error);
        clearTimeout(factIntervalId);
        document.getElementById('loadingContainer').style.display = 'none';
        showError(error.message);
        showToast('Failed to fetch data. Please try again.', 'error');
    }
}

function showLoading() {
    document.getElementById('loadingContainer').style.display = 'block';
    document.getElementById('result').innerHTML = ''; // Clear previous results
    
    // Cycle through health facts
    let factIndex = 0;
    const factElement = document.getElementById('loadingFact');
    
    function showNextFact() {
        factElement.textContent = healthFacts[factIndex];
        factIndex = (factIndex + 1) % healthFacts.length;
    }
    
    showNextFact(); // Show first fact immediately
    // Store interval ID to clear it later
    factIntervalId = setInterval(showNextFact, 2000); // Change fact every 2 seconds
}

// New function to calculate risk based on real data
function calculateRiskFromData(weather, airQuality) {
    let riskScore = 0; // Initialize risk score between 0 and 1

    // Factors from OpenWeather
    const temp = weather.main.temp; // Temperature in Celsius
    const humidity = weather.main.humidity; // Humidity in percentage
    const visibility = weather.visibility; // Visibility in meters
    const pressure = weather.main.pressure; // Pressure in hPa

    // Factors from IQAir
    const aqi = airQuality.data.current.pollution.aqius; // AQI (US EPA standard)

    // --- Risk Calculation Logic (You can refine this based on research) ---

    // Temperature Impact: Extreme temperatures can increase risk
    if (temp < 15 || temp > 35) { // Below 15°C or above 35°C
        riskScore += 0.15;
    } else if (temp < 10 || temp > 40) { // Below 10°C or above 40°C
        riskScore += 0.25;
    }

    // Humidity Impact: Very high humidity can foster pathogen growth
    if (humidity > 75) {
        riskScore += 0.15;
    } else if (humidity < 30) { // Very low humidity can dry out mucous membranes
        riskScore += 0.05;
    }

    // Air Quality Impact (AQI): Higher AQI means higher risk
    if (aqi > 150) { // Unhealthy
        riskScore += 0.3;
    } else if (aqi > 100) { // Unhealthy for Sensitive Groups
        riskScore += 0.2;
    } else if (aqi > 50) { // Moderate
        riskScore += 0.1;
    }

    // Visibility Impact: Poor visibility (often due to fog/smog) can indicate higher pollution
    if (visibility < 5000) { // Less than 5 km visibility
        riskScore += 0.05;
    } else if (visibility < 2000) { // Less than 2 km visibility
        riskScore += 0.1;
    }

    // Pressure (less direct impact on disease but can influence weather stability)
    // No direct risk added for pressure for simplicity in this model.

    // --- Other (simulated) factors ---
    // Population Density (inherently higher in cities) - could be a fixed base risk
    riskScore += 0.05; // Base risk for being in a city

    // Mobility (still random as we don't have real-time mobility data)
    // You could integrate real mobility data if available from other APIs.
    const mobilityFactor = (Math.random() * 0.15); // Random factor 0-15%
    riskScore += mobilityFactor;


    // Ensure riskScore is within a reasonable range (e.g., 0 to 1)
    return Math.min(Math.max(0, riskScore), 0.99); // Cap between 0 and 0.99
}

// Modify generateRiskReport to accept real data
function generateRiskReport(state, city, weatherData, airQualityData, riskLevel) {
    let riskCategory, riskColor, riskText;

    if (riskLevel < 0.3) {
        riskCategory = 'low';
        riskColor = 'risk-low';
        riskText = 'Low Risk';
    } else if (riskLevel < 0.7) {
        riskCategory = 'moderate';
        riskColor = 'risk-moderate';
        riskText = 'Moderate Risk';
    } else {
        riskCategory = 'high';
        riskColor = 'risk-high';
        riskText = 'High Risk';
    }

    // Extract real data
    const temperature = weatherData.main.temp;
    const humidity = weatherData.main.humidity;
    const airQuality = airQualityData.data.current.pollution.aqius; // AQI (US EPA standard)
    const visibility = (weatherData.visibility / 1000).toFixed(1); // Convert meters to km
    const pressure = weatherData.main.pressure; // Pressure in hPa

    // Determine simplified weather condition for theme
    const weatherConditionMain = weatherData.weather[0].main.toLowerCase(); // e.g., 'clouds', 'rain', 'clear'
    let themeCondition = 'default';
    if (weatherConditionMain.includes('clear')) {
        themeCondition = 'sunny';
    } else if (weatherConditionMain.includes('rain')) {
        themeCondition = 'rainy';
    } else if (weatherConditionMain.includes('cloud')) {
        themeCondition = 'cloudy';
    }
    updateWeatherTheme(themeCondition); // Update theme based on actual weather

    const resultHTML = `
        <div class="result-card">
            <div class="result-header">
                <h3><i class="fas fa-chart-line"></i> Risk Assessment for ${city}, ${state}</h3>
                <div class="timestamp">
                    <i class="fas fa-clock"></i> ${new Date().toLocaleString()}
                </div>
            </div>
            
            <div class="risk-indicator ${riskColor}">
                <h2><i class="fas fa-shield-alt"></i> ${riskText}</h2>
                <div class="risk-score">Risk Level: ${(riskLevel * 100).toFixed(1)}%</div>
            </div>
            
            <div class="data-grid">
                <div class="data-item">
                    <div class="icon"><i class="fas fa-thermometer-half"></i></div>
                    <div class="label">Temperature</div>
                    <div class="value">${temperature}°C</div>
                </div>
                <div class="data-item">
                    <div class="icon"><i class="fas fa-tint"></i></div>
                    <div class="label">Humidity</div>
                    <div class="value">${humidity}%</div>
                </div>
                <div class="data-item">
                    <div class="icon"><i class="fas fa-wind"></i></div>
                    <div class="label">Air Quality</div>
                    <div class="value">${airQuality} AQI</div>
                </div>
                <div class="data-item">
                    <div class="icon"><i class="fas fa-walking"></i></div>
                    <div class="label">Mobility</div>
                    <div class="value">${(Math.random() * 30 + 70).toFixed(0)}%</div> </div>
                <div class="data-item">
                    <div class="icon"><i class="fas fa-eye"></i></div>
                    <div class="label">Visibility</div>
                    <div class="value">${visibility}km</div>
                </div>
                <div class="data-item">
                    <div class="icon"><i class="fas fa-compress-arrows-alt"></i></div>
                    <div class="label">Pressure</div>
                    <div class="value">${pressure}hPa</div>
                </div>
            </div>
            
            <div class="recommendation">
                <div class="title"><i class="fas fa-user-md"></i> Health Recommendations</div>
                <div class="text">${getRecommendations(riskCategory)}</div>
            </div>
            
            <div class="additional-info">
                <div class="info-card">
                    <h4><i class="fas fa-exclamation-triangle"></i> Risk Factors</h4>
                    <p>${getRiskFactors(riskCategory)}</p>
                </div>
                <div class="info-card">
                    <h4><i class="fas fa-hospital"></i> Healthcare Capacity</h4>
                    <p>${getHealthcareInfo(city)}</p>
                </div>
            </div>
            
            <div class="speech-controls">
                <button class="speech-btn" onclick="readReport()">
                    <i class="fas fa-volume-up"></i> Read Report
                </button>
                <button class="speech-btn" onclick="downloadReport()">
                    <i class="fas fa-download"></i> Download PDF
                </button>
                <button class="speech-btn" onclick="shareReport()">
                    <i class="fas fa-share-alt"></i> Share
                </button>
            </div>
            
            <div class="risk-chart-container">
                <canvas id="riskBreakdownChart"></canvas>
            </div>
        </div>
    `;
    
    document.getElementById('result').innerHTML = resultHTML;
    
    // Render risk breakdown chart
    renderRiskBreakdownChart(weatherData, airQualityData, riskLevel);
    
    // Speak the result if speech is enabled
    if (speechEnabled) {
        speak(`Risk Assessment for ${city}. Risk level ${riskText}. Temperature: ${temperature} degrees Celsius. Humidity: ${humidity} percent. Air Quality: ${airQuality} AQI.`);
    }
}

function getRecommendations(riskCategory) {
    const recommendations = {
        low: "Continue following basic hygiene practices. Maintain social distancing and wear masks in crowded areas. Regular hand washing and sanitization recommended.",
        moderate: "Increased caution advised. Avoid large gatherings, wear N95 masks, and maintain strict hygiene protocols. Monitor your health closely for any symptoms.",
        high: "High risk detected. Minimize outdoor activities, work from home if possible, and avoid all non-essential travel. Seek immediate medical attention if symptoms develop."
    };
    
    return recommendations[riskCategory];
}

function getRiskFactors(riskCategory) {
    const factors = {
        low: "Favorable environmental conditions, good air quality, adequate healthcare facilities, and controlled mobility patterns contribute to reduced risk.",
        moderate: "Variable environmental factors, moderate air quality, and increased social mobility may contribute to disease transmission. Stay vigilant.",
        high: "Adverse environmental conditions, poor air quality, potentially limited healthcare capacity, and high mobility patterns significantly increase transmission risk. Exercise extreme caution."
    };
    
    return factors[riskCategory];
}

function getHealthcareInfo(city) {
    // This information is still static as it's not from an API.
    // You could integrate a local healthcare directory API if available.
    return `${city} has a general healthcare infrastructure with hospitals and medical centers. Emergency services are typically available.`;
}

function readReport() {
    const reportElement = document.querySelector('.result-card');
    if (reportElement) {
        // Get all text content, trying to make it readable for speech
        const headerText = reportElement.querySelector('h3').textContent;
        const riskText = reportElement.querySelector('.risk-indicator h2').textContent;
        const scoreText = reportElement.querySelector('.risk-score').textContent;
        
        const dataItems = reportElement.querySelectorAll('.data-item');
        let dataText = "";
        dataItems.forEach(item => {
            const label = item.querySelector('.label').textContent;
            const value = item.querySelector('.value').textContent;
            dataText += `${label} is ${value}. `;
        });
        
        const recommendationText = reportElement.querySelector('.recommendation .text').textContent;
        const combinedText = `${headerText}. ${riskText}. ${scoreText}. ${dataText} Health Recommendations: ${recommendationText}.`;
        speak(combinedText);
    }
}

function downloadReport() {
    const reportContent = document.querySelector('.result-card');
    if (!reportContent) return;
    
    // Create a more structured HTML report
    const reportHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Health Risk Report</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
                h1 { color: #667eea; }
                .risk-indicator { padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center; }
                .risk-low { background: #dcfce7; color: #166534; }
                .risk-moderate { background: #fef3c7; color: #92400e; }
                .risk-high { background: #fee2e2; color: #991b1b; }
                .data-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
                .data-item { padding: 15px; background: #f3f4f6; border-radius: 8px; text-align: center; }
                .recommendation { background: #f9fafb; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; }
            </style>
        </head>
        <body>
            ${reportContent.innerHTML}
            <footer style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #e5e7eb; text-align: center; color: #64748b;">
                <p>Generated on ${new Date().toLocaleString()}</p>
                <p>Advanced Disease Risk Predictor - India</p>
            </footer>
        </body>
        </html>
    `;
    
    const blob = new Blob([reportHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `health-risk-report-${new Date().toISOString().split('T')[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
    
    speak('Report downloaded successfully');
}

// Share report functionality
function shareReport() {
    const reportCard = document.querySelector('.result-card');
    if (!reportCard) return;
    
    const city = document.getElementById('cityInput').value;
    const state = document.getElementById('stateInput').value;
    const riskText = reportCard.querySelector('.risk-indicator h2').textContent;
    const riskScore = reportCard.querySelector('.risk-score').textContent;
    
    const shareText = `🏥 Health Risk Assessment\n📍 ${city}, ${state}\n⚠️ ${riskText}\n📊 ${riskScore}\n\nGenerated by Advanced Disease Risk Predictor`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Health Risk Report',
            text: shareText,
            url: window.location.href
        })
        .then(() => speak('Report shared successfully'))
        .catch((error) => console.log('Error sharing:', error));
    } else {
        // Fallback: Copy to clipboard
        navigator.clipboard.writeText(shareText)
            .then(() => {
                alert('Report details copied to clipboard!');
                speak('Report details copied to clipboard');
            })
            .catch(() => alert('Unable to share. Please try again.'));
    }
}

// Render risk breakdown chart
function renderRiskBreakdownChart(weatherData, airQualityData, riskLevel) {
    const ctx = document.getElementById('riskBreakdownChart');
    if (!ctx) return;
    
    const temp = weatherData.main.temp;
    const humidity = weatherData.main.humidity;
    const aqi = airQualityData.data.current.pollution.aqius;
    
    // Calculate individual risk contributions
    let tempRisk = 0;
    if (temp < 15 || temp > 35) tempRisk = 15;
    else if (temp < 10 || temp > 40) tempRisk = 25;
    
    let humidityRisk = 0;
    if (humidity > 75) humidityRisk = 15;
    else if (humidity < 30) humidityRisk = 5;
    
    let aqiRisk = 0;
    if (aqi > 150) aqiRisk = 30;
    else if (aqi > 100) aqiRisk = 20;
    else if (aqi > 50) aqiRisk = 10;
    
    const mobilityRisk = 15;
    const densityRisk = 5;
    const otherRisk = 10;
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Air Quality', 'Temperature', 'Humidity', 'Mobility', 'Population Density', 'Other Factors'],
            datasets: [{
                data: [aqiRisk, tempRisk, humidityRisk, mobilityRisk, densityRisk, otherRisk],
                backgroundColor: [
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(251, 191, 36, 0.8)',
                    'rgba(34, 197, 94, 0.8)',
                    'rgba(168, 85, 247, 0.8)',
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(156, 163, 175, 0.8)'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Risk Factor Breakdown',
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    padding: 20
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value}% (${percentage}% of total risk)`;
                        }
                    }
                }
            }
        }
    });
}

function showError(message = '') {
    const defaultErrorMessage = 'Unable to fetch real-time data. Please check your API keys or try again later.';
    // Display specific error message if provided, otherwise default
    const displayMessage = message || defaultErrorMessage;

    const errorHTML = `
        <div class="error-container">
            <div class="error-illustration">
                <div class="virus"></div>
                <div class="shield"></div>
            </div>
            <h2 class="error-title">Data Fetch Error</h2>
            <p class="error-message">${displayMessage}</p>
            <div style="margin-top: 20px;">
                <button class="retry-btn" onclick="retryAnalysis()">
                    <i class="fas fa-redo"></i> Retry Analysis
                </button>
                <button class="retry-btn" onclick="location.reload()">
                    <i class="fas fa-home"></i> Back to Home
                </button>
            </div>
            <div style="margin-top: 30px; padding: 20px; background: var(--bg-secondary); border-radius: 15px;">
                <h4 style="color: var(--text-primary); margin-bottom: 15px;">
                    <i class="fas fa-lightbulb"></i> Meanwhile...
                </h4>
                <p style="color: var(--text-secondary); line-height: 1.6;">
                    While we restore the system, please continue following basic hygiene practices and maintain social distancing.
                </p>
            </div>
        </div>
    `;
    
    document.getElementById('result').innerHTML = errorHTML;
    
    if (speechEnabled) {
        speak('Data Fetch Error. ' + displayMessage);
    }
}

function retryAnalysis() {
    // Clear any existing error messages or previous results
    document.getElementById('result').innerHTML = ''; 
    checkRisk(); // Retry the analysis with the same inputs
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (e.matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('theme-icon').className = 'fas fa-sun';
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        document.getElementById('theme-icon').className = 'fas fa-moon';
    }
});

// The time-based theme update interval is removed, as weather theme is now dynamic from API.
// If API fails, it falls back to time-based via updateWeatherTheme('default'). 