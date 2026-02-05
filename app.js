import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { App as CapApp } from '@capacitor/app';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { CapacitorHttp } from '@capacitor/core';

// ERPNext Configuration
const ERP_URL = 'https://genex.thesmarterp.com';
const API_KEY = '7941a0a93e2a171';
const API_SECRET = 'c41c3cbee71760b';

// Global State
let currentStudent = null;
let courses = [];
let currentCourse = null;
let currentVideos = [];
let watermarkInterval = null;

// Authentication Header
function getAuthHeader() {
    return 'token ' + API_KEY + ':' + API_SECRET;
}

// Capacitor HTTP Fetch
async function capacitorFetch(url, options = {}) {
    try {
        const response = await CapacitorHttp.request({
            url: url,
            method: options.method || 'GET',
            headers: options.headers || {},
            data: options.body ? JSON.parse(options.body) : undefined
        });
        
        return {
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            json: async () => response.data,
            text: async () => JSON.stringify(response.data)
        };
    } catch (error) {
        console.error('Capacitor HTTP Error:', error);
        throw error;
    }
}

// YouTube Video ID Extractor
function getYouTubeVideoId(url) {
    if (!url) return null;
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\?\/]+)/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    
    for (let pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

// Student Name Initials
function getInitials(firstName, lastName) {
    const first = (firstName || '').charAt(0).toUpperCase();
    const last = (lastName || '').charAt(0).toUpperCase();
    return first + last || '??';
}

// Check if course has expired
function isCourseExpired(expiryDate) {
    if (!expiryDate) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    
    return today > expiry;
}

// Format expiry date for display
function formatExpiryDate(expiryDate) {
    if (!expiryDate) return 'No Expiry';
    
    const expiry = new Date(expiryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);
    
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
        return 'Expired';
    } else if (diffDays === 0) {
        return 'Expires Today';
    } else if (diffDays === 1) {
        return 'Expires Tomorrow';
    } else if (diffDays <= 30) {
        return `${diffDays} days left`;
    } else {
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return `Until ${expiry.toLocaleDateString('en-US', options)}`;
    }
}

// Course Icon Selector
function getCourseIcon(courseName) {
    const name = (courseName || '').toLowerCase();
    
    if (name.includes('basic') || name.includes('beginner') || name.includes('intro')) return '🎯';
    if (name.includes('advanced') || name.includes('pro') || name.includes('expert')) return '🚀';
    if (name.includes('technical') || name.includes('analysis')) return '📊';
    if (name.includes('strategy') || name.includes('trading')) return '💹';
    if (name.includes('risk') || name.includes('management')) return '🛡️';
    if (name.includes('psychology') || name.includes('mindset')) return '🧠';
    if (name.includes('fundamental')) return '📈';
    if (name.includes('crypto') || name.includes('bitcoin')) return '₿';
    if (name.includes('forex')) return '💱';
    if (name.includes('stock') || name.includes('equity')) return '📉';
    
    return '📚';
}

// Error Display
function showError(message) {
    const errorEl = document.getElementById('loginError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add('show');
    }
}

function hideError() {
    const errorEl = document.getElementById('loginError');
    if (errorEl) {
        errorEl.classList.remove('show');
    }
}

// Mark Private Key as Used
async function markKeyAsUsed(studentName) {
    try {
        const response = await capacitorFetch(
            `${ERP_URL}/api/resource/Student/${studentName}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': getAuthHeader(),
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    custom_key_used: 1
                })
            }
        );
        
        if (!response.ok) {
            console.error('Failed to mark key as used');
        }
    } catch (error) {
        console.error('Error marking key as used:', error);
    }
}

// Secure Credential Storage
async function saveCredentials(credentials) {
    try {
        await Preferences.set({
            key: 'studentEmail',
            value: credentials.email
        });
        
        await Preferences.set({
            key: 'studentData',
            value: JSON.stringify(credentials.studentData)
        });
        
        return true;
    } catch (error) {
        console.error('Error saving credentials:', error);
        return false;
    }
}

async function getCredentials() {
    try {
        const email = await Preferences.get({ key: 'studentEmail' });
        const studentData = await Preferences.get({ key: 'studentData' });
        
        if (email.value && studentData.value) {
            return {
                email: email.value,
                studentData: JSON.parse(studentData.value)
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error getting credentials:', error);
        return null;
    }
}

async function clearCredentials() {
    try {
        await Preferences.remove({ key: 'studentEmail' });
        await Preferences.remove({ key: 'studentData' });
        return true;
    } catch (error) {
        console.error('Error clearing credentials:', error);
        return false;
    }
}

// Login Form Handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();
    
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value.trim();
    const privateKey = document.getElementById('privateKeyInput').value.trim();
    const loginBtn = document.getElementById('loginBtn');
    
    loginBtn.disabled = true;
    loginBtn.textContent = '🔄 Verifying credentials...';

    try {
        const filters = JSON.stringify([["student_email_id", "=", email]]);
        const fields = JSON.stringify(["name", "student_email_id", "custom_private_key", "custom_password", "first_name", "last_name", "custom_key_used", "enabled"]);
        
        const url = `${ERP_URL}/api/resource/Student?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}`;
        
        const response = await capacitorFetch(url, {
            method: 'GET',
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to connect to server. Status: ' + response.status);
        }

        const data = await response.json();
        
        if (!data.data || data.data.length === 0) {
            throw new Error('Invalid email address');
        }

        const student = data.data[0];
        
        if (student.enabled === 0) {
            throw new Error('Your account has been disabled. Please contact administrator.');
        }
        
        if (!student.custom_password) {
            throw new Error('No password set. Contact administrator.');
        }
        
        const storedPassword = String(student.custom_password).trim();
        const enteredPassword = String(password).trim();
        
        if (storedPassword !== enteredPassword) {
            throw new Error('Invalid password');
        }
        
        if (!student.custom_private_key) {
            throw new Error('No private key assigned. Contact administrator.');
        }
        
        const storedKey = String(student.custom_private_key).trim();
        const enteredKey = String(privateKey).trim();
        
        if (storedKey !== enteredKey) {
            throw new Error('Invalid private key');
        }
        
        if (student.custom_key_used === 1) {
            throw new Error('This private key has already been used. Contact administrator for a new key.');
        }
        
        await markKeyAsUsed(student.name);
        
        currentStudent = student;
        
        await saveCredentials({
            email: email,
            studentData: student
        });
        
        document.getElementById('studentName').textContent = 
            `${student.first_name} ${student.last_name || ''}`;
        document.getElementById('studentInitials').textContent = 
            getInitials(student.first_name, student.last_name);
        
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainScreen').classList.remove('hidden');
        
        loadCourses();
        
    } catch (error) {
        console.error('Login error:', error);
        showError(error.message || 'Failed to connect. Please check your internet connection.');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Verify & Login';
    }
});

// Auto-login Check
async function checkAutoLogin() {
    const savedCreds = await getCredentials();
    
    if (savedCreds && savedCreds.email && savedCreds.studentData) {
        try {
            const studentData = savedCreds.studentData;
            
            const filters = JSON.stringify([["student_email_id", "=", savedCreds.email]]);
            const fields = JSON.stringify(["name", "student_email_id", "custom_private_key", "custom_password", "first_name", "last_name", "custom_key_used", "enabled"]);
            
            const url = `${ERP_URL}/api/resource/Student?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}`;
            
            const response = await capacitorFetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': getAuthHeader(),
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Cannot verify student status');
            }
            
            const data = await response.json();
            
            if (!data.data || data.data.length === 0) {
                await clearCredentials();
                showLoginScreen();
                return;
            }
            
            const student = data.data[0];
            
            if (student.enabled === 0) {
                await clearCredentials();
                showError('Your account has been disabled. Please contact administrator.');
                showLoginScreen();
                return;
            }
            
            currentStudent = student;
            
            document.getElementById('studentName').textContent = 
                `${currentStudent.first_name} ${currentStudent.last_name || ''}`;
            document.getElementById('studentInitials').textContent = 
                getInitials(currentStudent.first_name, currentStudent.last_name);
            
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) {
                loadingScreen.classList.add('hidden');
            }
            document.getElementById('mainScreen').classList.remove('hidden');
            
            loadCourses();
        } catch (error) {
            console.error('Auto-login failed:', error);
            await clearCredentials();
            showLoginScreen();
        }
    } else {
        showLoginScreen();
    }
}

function showLoginScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
    }
    document.getElementById('loginScreen').classList.remove('hidden');
}

// Load courses from custom_courses child table
async function loadCourses() {
    const loadingEl = document.getElementById('loadingCourses');
    const gridEl = document.getElementById('coursesGrid');
    const noCoursesEl = document.getElementById('noCourses');
    
    loadingEl.classList.remove('hidden');
    gridEl.innerHTML = '';
    noCoursesEl.classList.add('hidden');

    try {
        const url = `${ERP_URL}/api/resource/Student/${encodeURIComponent(currentStudent.name)}`;
        
        console.log('Fetching student with courses:', currentStudent.name);
        
        const response = await capacitorFetch(url, {
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load student data');
        }

        const data = await response.json();
        const studentData = data.data;
        
        const studentCourses = studentData.custom_courses || [];
        
        console.log('Student courses:', studentCourses);
        
        if (studentCourses.length === 0) {
            loadingEl.classList.add('hidden');
            noCoursesEl.classList.remove('hidden');
            noCoursesEl.querySelector('h3').textContent = 'No Courses Assigned';
            noCoursesEl.querySelector('p').textContent = 'You do not have access to any courses yet. Please contact your administrator.';
            return;
        }
        
        const coursePromises = studentCourses
            .filter(sc => !isCourseExpired(sc.expiry_date))
            .map(async (studentCourse) => {
                try {
                    const courseResponse = await capacitorFetch(
                        `${ERP_URL}/api/resource/Course/${encodeURIComponent(studentCourse.course)}?fields=["name","course_name"]`,
                        {
                            headers: {
                                'Authorization': getAuthHeader(),
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    
                    if (courseResponse.ok) {
                        const courseData = await courseResponse.json();
                        return {
                            ...courseData.data,
                            expiry_date: studentCourse.expiry_date
                        };
                    }
                    return null;
                } catch (error) {
                    console.error('Error fetching course:', studentCourse.course, error);
                    return null;
                }
            });
        
        const fetchedCourses = await Promise.all(coursePromises);
        courses = fetchedCourses.filter(c => c !== null);
        
        console.log('Loaded active courses:', courses);
        
        loadingEl.classList.add('hidden');
        
        if (courses.length === 0) {
            noCoursesEl.classList.remove('hidden');
            noCoursesEl.querySelector('h3').textContent = 'No Active Courses';
            noCoursesEl.querySelector('p').textContent = 'All your courses have expired. Please contact your administrator.';
        } else {
            displayCourses(courses);
        }
        
    } catch (error) {
        loadingEl.classList.add('hidden');
        console.error('Error loading courses:', error);
        noCoursesEl.classList.remove('hidden');
        noCoursesEl.querySelector('h3').textContent = 'Error Loading Courses';
        noCoursesEl.querySelector('p').textContent = 'Unable to load your courses. Please check your internet connection.';
    }
}

// Display Courses with expiry dates
function displayCourses(courseList) {
    const gridEl = document.getElementById('coursesGrid');
    gridEl.innerHTML = '';
    
    courseList.forEach((course) => {
        const card = document.createElement('div');
        card.className = 'course-card';
        card.onclick = () => loadCourseVideos(course);
        
        const icon = getCourseIcon(course.course_name);
        const expiryText = formatExpiryDate(course.expiry_date);
        const isExpiringSoon = course.expiry_date && !isCourseExpired(course.expiry_date) && 
                               (new Date(course.expiry_date) - new Date()) / (1000 * 60 * 60 * 24) <= 7;
        
        card.innerHTML = `
            <div class="course-icon">${icon}</div>
            <h3>${course.course_name || course.name}</h3>
            <p>Click to view course videos • Professional trading education</p>
            <div class="course-meta">
                <div class="course-meta-item">
                    <span>📹</span>
                    <span>Video Lectures</span>
                </div>
                <div class="course-meta-item">
                    <span>⏰</span>
                    <span>${expiryText}</span>
                </div>
            </div>
            ${isExpiringSoon ? '<span class="status-badge status-warning">⚠️ EXPIRING SOON</span>' : ''}
        `;
        
        gridEl.appendChild(card);
    });
}

// Load Course Videos - FIXED VERSION
async function loadCourseVideos(course) {
    currentCourse = course;
    
    document.getElementById('courseList').classList.add('hidden');
    document.getElementById('videoListScreen').classList.remove('hidden');
    
    document.getElementById('courseTitle').textContent = course.course_name || course.name;
    document.getElementById('courseTitleIcon').textContent = getCourseIcon(course.course_name);
    
    const loadingEl = document.getElementById('loadingVideos');
    const videosEl = document.getElementById('videosList');
    const noVideosEl = document.getElementById('noVideos');
    
    loadingEl.classList.remove('hidden');
    videosEl.innerHTML = '';
    noVideosEl.classList.add('hidden');
    
    try {
        const url = `${ERP_URL}/api/resource/Course/${encodeURIComponent(course.name)}`;
        
        console.log('Fetching course with topics:', course.name);
        
        const response = await capacitorFetch(url, {
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load course');
        }

        const data = await response.json();
        const courseData = data.data;
        
        // Check for live class link
        const liveClassLink = courseData.custom_youtube_link;
        checkAndShowLiveClassButton(liveClassLink);
        
        const topics = courseData.topics || [];
        
        currentVideos = topics
            .filter(topic => topic.custom_video_link && topic.custom_video_link.trim() !== '')
            .map((topic, index) => ({
                name: topic.name,
                title: topic.topic_name || `Video ${index + 1}`,
                url: topic.custom_video_link,
                idx: topic.idx || index + 1
            }));
        
        console.log('Loaded videos from topics:', currentVideos);
        
        loadingEl.classList.add('hidden');
        
        if (currentVideos.length === 0) {
            noVideosEl.classList.remove('hidden');
            noVideosEl.querySelector('h3').textContent = 'No Videos Available';
            noVideosEl.querySelector('p').textContent = 'This course doesn\'t have any video links yet. Please contact your administrator.';
        } else {
            displayVideos(currentVideos);
        }
        
    } catch (error) {
        loadingEl.classList.add('hidden');
        console.error('Error loading videos:', error);
        alert('Error loading videos: ' + error.message);
    }
}

// Display Videos
function displayVideos(videoList) {
    const videosEl = document.getElementById('videosList');
    videosEl.innerHTML = '';
    
    videoList.forEach((video, index) => {
        const videoCard = document.createElement('div');
        videoCard.className = 'video-item';
        videoCard.onclick = () => playVideo(video, index);
        
        videoCard.innerHTML = `
            <div class="video-number">${index + 1}</div>
            <div class="video-info">
                <h4>${video.title || video.name}</h4>
                <p>Lecture ${index + 1} • Click to watch</p>
            </div>
            <div class="video-play-icon">▶️</div>
        `;
        
        videosEl.appendChild(videoCard);
    });
}

// Play Video
function playVideo(video, index) {
    const videoId = getYouTubeVideoId(video.url);
    
    if (!videoId) {
        alert('Invalid video link');
        return;
    }
    
    console.log('Playing video:', video.title, 'ID:', videoId);
    
    document.getElementById('videoListScreen').classList.add('hidden');
    document.getElementById('videoPlayer').classList.add('hidden');
    document.getElementById('videoLoadingScreen').classList.remove('hidden');
    
    document.getElementById('currentVideoTitle').textContent = video.title || video.name;
    document.getElementById('videoProgress').textContent = `Video ${index + 1} of ${currentVideos.length}`;
    
    updatePlaylist(index);
    startWatermark();
    setupVideoProtection();
    
    const iframe = document.getElementById('videoFrame');
    
    const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?` + [
        'autoplay=1',
        'rel=0',
        'modestbranding=1',
        'controls=1',
        'disablekb=1',
        'fs=0',
        'iv_load_policy=3',
        'playsinline=1',
        'origin=' + window.location.origin
    ].join('&');
    
    console.log('Loading video URL:', embedUrl);
    
    // Clear any previous onload handlers
    iframe.onload = null;
    iframe.onerror = null;
    
    // Set the source
    iframe.src = embedUrl;
    
    // Use timeout instead of onload (more reliable for iframes)
    setTimeout(() => {
        console.log('Showing video player after timeout');
        document.getElementById('videoLoadingScreen').classList.add('hidden');
        document.getElementById('videoPlayer').classList.remove('hidden');
        
        const dotBtn = document.getElementById('tam-dots-btn');
        if (dotBtn) dotBtn.classList.remove('hidden');
    }, 1500); // 1.5 seconds is enough for iframe to start loading
}

let isCustomFullscreen = false;
let headerAutoHideTimer = null;

function setupVideoProtection() {
    const videoContainer = document.querySelector('.video-container');
    
    if (!videoContainer) return;
    
    videoContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, true);
    
    videoContainer.style.userSelect = 'none';
    videoContainer.style.webkitUserSelect = 'none';
    
    // Setup protective overlay to block right-click but allow left-click
    const protectionOverlay = document.getElementById('videoProtectionOverlay');
    if (protectionOverlay) {
        // Block right-click (context menu)
        protectionOverlay.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, true);
        
        // Block all mouse button events except left-click
        protectionOverlay.addEventListener('mousedown', (e) => {
            // Allow only left-click (button 0)
            if (e.button !== 0) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            // For left-click, temporarily disable overlay to let click pass through
            protectionOverlay.style.pointerEvents = 'none';
            setTimeout(() => {
                protectionOverlay.style.pointerEvents = 'auto';
            }, 100);
        }, true);
        
        // Block touch and hold (mobile context menu)
        let touchTimer;
        protectionOverlay.addEventListener('touchstart', (e) => {
            touchTimer = setTimeout(() => {
                e.preventDefault();
                e.stopPropagation();
            }, 500);
        }, true);
        
        protectionOverlay.addEventListener('touchend', () => {
            clearTimeout(touchTimer);
        }, true);
        
        protectionOverlay.addEventListener('touchmove', () => {
            clearTimeout(touchTimer);
        }, true);
    }
    
    // Block keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts, true);
    
    addCustomFullscreenButton();
}

function handleKeyboardShortcuts(e) {
    if (document.getElementById('videoPlayer').classList.contains('hidden')) return;
    
    if (
        e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S') ||
        e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I' || e.key === 'j' || e.key === 'J' || e.key === 'c' || e.key === 'C') ||
        e.key === 'F12' ||
        e.key === 'PrintScreen' ||
        (e.metaKey && e.shiftKey && e.key === '3') ||
        (e.metaKey && e.shiftKey && e.key === '4') ||
        (e.metaKey && e.shiftKey && e.key === '5')
    ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
    
    if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleCustomFullscreen();
        return false;
    }
    
    if (e.key === 'Escape' && isCustomFullscreen) {
        exitCustomFullscreen();
        return false;
    }
}

function addCustomFullscreenButton() {
    const videoPlayer = document.getElementById('videoPlayer');
    if (!videoPlayer) return;
    
    const existingBtn = document.getElementById('customFullscreenBtn');
    if (existingBtn) existingBtn.remove();
    
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.id = 'customFullscreenBtn';
    fullscreenBtn.className = 'custom-fullscreen-btn';
    fullscreenBtn.innerHTML = '⛶';
    fullscreenBtn.title = 'Fullscreen (F)';
    fullscreenBtn.onclick = toggleCustomFullscreen;
    
    const videoHeader = document.querySelector('.video-header');
    if (videoHeader) {
        videoHeader.appendChild(fullscreenBtn);
    }
}

function toggleCustomFullscreen() {
    if (isCustomFullscreen) {
        exitCustomFullscreen();
    } else {
        enterCustomFullscreen();
    }
}

function showHeaderTemporarily() {
    if (!isCustomFullscreen) return;
    
    const videoHeader = document.querySelector('.video-header');
    if (!videoHeader) return;
    
    videoHeader.classList.add('show-header');
    
    if (headerAutoHideTimer) {
        clearTimeout(headerAutoHideTimer);
    }
    
    headerAutoHideTimer = setTimeout(() => {
        videoHeader.classList.remove('show-header');
    }, 3000);
}

function setupFullscreenTouchHandlers() {
    const videoPlayer = document.getElementById('videoPlayer');
    if (!videoPlayer) return;
    
    videoPlayer.removeEventListener('touchend', handleFullscreenTouch);
    videoPlayer.removeEventListener('click', handleFullscreenTouch);
    document.removeEventListener('touchend', handleDocumentTouch);
    document.removeEventListener('click', handleDocumentTouch);
    
    videoPlayer.addEventListener('touchend', handleFullscreenTouch, false);
    videoPlayer.addEventListener('click', handleFullscreenTouch, false);
    document.addEventListener('touchend', handleDocumentTouch, false);
    document.addEventListener('click', handleDocumentTouch, false);
}

function handleFullscreenTouch(e) {
    if (!isCustomFullscreen) return;
    e.stopPropagation();
    showHeaderTemporarily();
}

function handleDocumentTouch(e) {
    if (!isCustomFullscreen) return;
    showHeaderTemporarily();
}

async function enterCustomFullscreen() {
    const videoPlayer = document.getElementById('videoPlayer');
    if (!videoPlayer) return;
    
    try {
        if (videoPlayer.requestFullscreen) {
            await videoPlayer.requestFullscreen();
        } else if (videoPlayer.webkitRequestFullscreen) {
            await videoPlayer.webkitRequestFullscreen();
        } else if (videoPlayer.mozRequestFullScreen) {
            await videoPlayer.mozRequestFullScreen();
        } else if (videoPlayer.msRequestFullscreen) {
            await videoPlayer.msRequestFullscreen();
        }
        
        if (Capacitor.isNativePlatform()) {
            try {
                await ScreenOrientation.unlock();
                await ScreenOrientation.lock({ orientation: 'landscape' });
            } catch (error) {
                console.log('Screen rotation not supported:', error);
            }
        }
        
        isCustomFullscreen = true;
        videoPlayer.classList.add('custom-fullscreen-active');
        
        const btn = document.getElementById('customFullscreenBtn');
        if (btn) {
            btn.innerHTML = '⛶';
            btn.title = 'Exit Fullscreen (ESC)';
        }
        
        // Setup touch handlers immediately
        setTimeout(() => {
            setupFullscreenTouchHandlers();
        }, 100);
        
    } catch (error) {
        console.error('Fullscreen error:', error);
    }
}

async function exitCustomFullscreen() {
    const videoPlayer = document.getElementById('videoPlayer');
    
    try {
        if (document.exitFullscreen) {
            await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            await document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            await document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            await document.msExitFullscreen();
        }
        
        if (Capacitor.isNativePlatform()) {
            try {
                await ScreenOrientation.lock({ orientation: 'portrait' });
            } catch (error) {
                console.log('Screen rotation not supported:', error);
            }
        }
        
        isCustomFullscreen = false;
        if (videoPlayer) {
            videoPlayer.classList.remove('custom-fullscreen-active');
        }
        
        if (headerAutoHideTimer) {
            clearTimeout(headerAutoHideTimer);
            headerAutoHideTimer = null;
        }
        
        const videoHeader = document.querySelector('.video-header');
        if (videoHeader) {
            videoHeader.classList.remove('show-header');
        }
        
        if (videoPlayer) {
            videoPlayer.removeEventListener('touchend', handleFullscreenTouch);
            videoPlayer.removeEventListener('click', handleFullscreenTouch);
        }
        document.removeEventListener('touchend', handleDocumentTouch);
        document.removeEventListener('click', handleDocumentTouch);
        
        const btn = document.getElementById('customFullscreenBtn');
        if (btn) {
            btn.innerHTML = '⛶';
            btn.title = 'Fullscreen (F)';
        }
        
    } catch (error) {
        console.error('Exit fullscreen error:', error);
    }
}

document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);
document.addEventListener('MSFullscreenChange', handleFullscreenChange);

function handleFullscreenChange() {
    const isFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
    );
    
    if (!isFullscreen && isCustomFullscreen) {
        isCustomFullscreen = false;
        const videoPlayer = document.getElementById('videoPlayer');
        if (videoPlayer) {
            videoPlayer.classList.remove('custom-fullscreen-active');
        }
        
        if (headerAutoHideTimer) {
            clearTimeout(headerAutoHideTimer);
            headerAutoHideTimer = null;
        }
        
        const videoHeader = document.querySelector('.video-header');
        if (videoHeader) {
            videoHeader.classList.remove('show-header');
        }
        
        const btn = document.getElementById('customFullscreenBtn');
        if (btn) {
            btn.innerHTML = '⛶';
            btn.title = 'Fullscreen (F)';
        }
        
        if (Capacitor.isNativePlatform()) {
            ScreenOrientation.lock({ orientation: 'portrait' }).catch(err => {
                console.log('Screen rotation not supported:', err);
            });
        }
    }
}

function updatePlaylist(currentIndex) {
    const playlistEl = document.getElementById('playlistVideos');
    playlistEl.innerHTML = '';
    
    document.getElementById('playlistCount').textContent = `${currentVideos.length} video${currentVideos.length !== 1 ? 's' : ''}`;
    
    currentVideos.forEach((video, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item' + (index === currentIndex ? ' active' : '');
        item.onclick = () => playVideo(video, index);
        
        item.innerHTML = `
            <div class="playlist-item-number">${index + 1}</div>
            <div class="playlist-item-info">
                <div class="playlist-item-title">${video.title || video.name}</div>
                <div class="playlist-item-meta">Lecture ${index + 1}</div>
            </div>
            ${index === currentIndex ? '<div class="playlist-item-playing">▶️</div>' : ''}
        `;
        
        playlistEl.appendChild(item);
    });
}

function startWatermark() {
    stopWatermark();
    
    if (!currentStudent) return;
    
    const overlay = document.getElementById('watermarkOverlay');
    if (!overlay) return;
    
    overlay.innerHTML = '';
    
    const studentInfo = `${currentStudent.first_name} ${currentStudent.last_name || ''} • ${currentStudent.student_email_id}`;
    
    const positions = [
        { x: 20, y: 50 },
        { x: 80, y: 85 }
    ];
    
    positions.forEach((pos) => {
        const mark = document.createElement('div');
        mark.className = 'watermark-text';
        mark.textContent = studentInfo;
        mark.style.left = `${pos.x}%`;
        mark.style.top = `${pos.y}%`;
        mark.style.pointerEvents = 'none';
        mark.style.userSelect = 'none';
        overlay.appendChild(mark);
    });
    
    watermarkInterval = setInterval(() => {
        const marks = overlay.querySelectorAll('.watermark-text');
        marks.forEach((mark) => {
            const currentLeft = parseFloat(mark.style.left);
            const currentTop = parseFloat(mark.style.top);
            
            const newLeft = currentLeft + (Math.random() * 4 - 2);
            const newTop = currentTop + (Math.random() * 4 - 2);
            
            mark.style.left = `${Math.max(5, Math.min(90, newLeft))}%`;
            mark.style.top = `${Math.max(5, Math.min(90, newTop))}%`;
            
            const opacity = 0.18 + Math.random() * 0.12;
            mark.style.color = `rgba(255, 255, 255, ${opacity})`;
        });
    }, 2000);
}

function stopWatermark() {
    if (watermarkInterval) {
        clearInterval(watermarkInterval);
        watermarkInterval = null;
    }
    
    const overlay = document.getElementById('watermarkOverlay');
    if (overlay) {
        overlay.innerHTML = '';
    }
    
    document.removeEventListener('keydown', handleKeyboardShortcuts, true);
    
    const fullscreenBtn = document.getElementById('customFullscreenBtn');
    if (fullscreenBtn) {
        fullscreenBtn.remove();
    }
    
    if (isCustomFullscreen) {
        exitCustomFullscreen();
    }
}

window.backToVideos = function() {
    if (isCustomFullscreen) {
        exitCustomFullscreen();
        return;
    }
    
    document.getElementById('videoPlayer').classList.add('hidden');
    document.getElementById('videoLoadingScreen').classList.add('hidden');
    document.getElementById('videoListScreen').classList.remove('hidden');
    
    const dotBtn = document.getElementById('tam-dots-btn');
    if (dotBtn) dotBtn.classList.add('hidden');
    
    const iframe = document.getElementById('videoFrame');
    iframe.src = 'about:blank';
    
    stopWatermark();
};

window.backToCourses = function() {
    document.getElementById('videoListScreen').classList.add('hidden');
    document.getElementById('courseList').classList.remove('hidden');
    
    const liveBtn = document.getElementById('liveClassBtn');
    if (liveBtn) liveBtn.classList.add('hidden');
    currentLiveClassLink = '';
    
    currentCourse = null;
    currentVideos = [];
};

function setupGlobalProtection() {
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    }, true);
    
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    
    const detectDevTools = () => {
        const threshold = 160;
        if (window.outerWidth - window.innerWidth > threshold || 
            window.outerHeight - window.innerHeight > threshold) {
            console.clear();
            document.body.innerHTML = '<h1 style="text-align:center;margin-top:50px;">Developer tools detected. Access denied.</h1>';
        }
    };
    
    setInterval(detectDevTools, 1000);
}

// ========================================
// ANDROID BACK BUTTON HANDLER
// ========================================
function setupAndroidBackButton() {
    if (!Capacitor.isNativePlatform()) return;
    
    CapApp.addListener('backButton', ({ canGoBack }) => {
        console.log('Back button pressed');
        
        // Priority 1: Exit fullscreen if active
        if (isCustomFullscreen) {
            exitCustomFullscreen();
            return;
        }
        
        // Priority 2: Close live class modal if open
        const liveModal = document.getElementById('liveClassModal');
        if (liveModal && !liveModal.classList.contains('hidden')) {
            closeLiveClassModal();
            return;
        }
        
        // Priority 3: Go back from video player to video list
        const videoPlayer = document.getElementById('videoPlayer');
        if (videoPlayer && !videoPlayer.classList.contains('hidden')) {
            backToVideos();
            return;
        }
        
        // Priority 4: Go back from video list to course list
        const videoListScreen = document.getElementById('videoListScreen');
        if (videoListScreen && !videoListScreen.classList.contains('hidden')) {
            backToCourses();
            return;
        }
        
        // Priority 5: Exit app from main screen
        const mainScreen = document.getElementById('mainScreen');
        if (mainScreen && !mainScreen.classList.contains('hidden')) {
            CapApp.exitApp();
            return;
        }
        
        // Default: Exit app
        CapApp.exitApp();
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('LMS Mobile App Loaded');
    
    setupGlobalProtection();
    setupAndroidBackButton(); // Setup Android back button handling
    
    if (Capacitor.isNativePlatform()) {
        try {
            await ScreenOrientation.lock({ orientation: 'portrait' });
        } catch (error) {
            console.log('Screen orientation lock not supported:', error);
        }
    }
    
    await checkAutoLogin();
    
    if (Capacitor.isNativePlatform()) {
        CapApp.addListener('appStateChange', ({ isActive }) => {
            if (!isActive) {
                const iframe = document.getElementById('videoFrame');
                if (iframe && iframe.src && iframe.src.includes('youtube.com')) {
                    iframe.src = 'about:blank';
                    stopWatermark();
                }
            }
        });
    }
});

// Live Class Functionality
let currentLiveClassLink = '';

function isLiveClassLink(url) {
    if (!url || typeof url !== 'string') return false;
    const urlLower = url.toLowerCase();
    return urlLower.includes('zoom.us') || 
           urlLower.includes('meet.google.com') || 
           urlLower.includes('youtube.com') || 
           urlLower.includes('teams.microsoft.com');
}

function checkAndShowLiveClassButton(link) {
    const btn = document.getElementById('liveClassBtn');
    if (!btn) return;
    
    if (isLiveClassLink(link)) {
        currentLiveClassLink = link;
        btn.classList.remove('hidden');
    } else {
        currentLiveClassLink = '';
        btn.classList.add('hidden');
    }
}

window.showLiveClassModal = function() {
    if (!currentLiveClassLink) return;
    
    const modal = document.getElementById('liveClassModal');
    const input = document.getElementById('liveClassLink');
    
    if (modal && input) {
        input.value = currentLiveClassLink;
        modal.classList.remove('hidden');
    }
};

window.closeLiveClassModal = function() {
    const modal = document.getElementById('liveClassModal');
    if (modal) {
        modal.classList.add('hidden');
    }
};

window.copyLiveClassLink = function() {
    const input = document.getElementById('liveClassLink');
    const btnText = document.getElementById('copyBtnText');
    
    if (!input) return;
    
    input.select();
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(input.value).then(() => {
            if (btnText) {
                const originalText = btnText.textContent;
                btnText.textContent = '✓ Copied!';
                setTimeout(() => {
                    btnText.textContent = originalText;
                }, 2000);
            }
        }).catch(() => {
            document.execCommand('copy');
            if (btnText) {
                const originalText = btnText.textContent;
                btnText.textContent = '✓ Copied!';
                setTimeout(() => {
                    btnText.textContent = originalText;
                }, 2000);
            }
        });
    } else {
        document.execCommand('copy');
        if (btnText) {
            const originalText = btnText.textContent;
            btnText.textContent = '✓ Copied!';
            setTimeout(() => {
                btnText.textContent = originalText;
            }, 2000);
        }
    }
};

window.openLiveClassLink = function() {
    if (!currentLiveClassLink) return;
    
    window.open(currentLiveClassLink, '_system');
    closeLiveClassModal();
};  