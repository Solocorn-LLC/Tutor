/**
 * Student dashboard copy (English).
 */

export const dashboardStrings = {
  welcomeTitle: 'Welcome back,',
  welcomeSubtitle: 'Ready to continue your learning journey?',
  continueLearning: 'Continue Learning',
  browseSubjects: 'Browse subjects',
  noCoursesInProgress: 'No courses in progress',
  browseSubjectsEmpty: 'Browse subjects and start learning.',
  recommendedForYou: 'Recommended for you',
  noRecommendationsYet: 'No recommendations yet',
  noRecommendationsHint: 'Complete lessons and quizzes to get personalized suggestions.',
  dailyQuests: 'Daily Quests',
  noDailyQuests: 'No daily quests today',
  noDailyQuestsHint: 'Complete lessons to unlock quests and earn XP.',
  goToMissions: 'Go to Missions',
  learningWorlds: 'Learning Worlds',
  noWorldsYet: 'No worlds unlocked yet',
  noWorldsHint: 'Level up to unlock learning worlds.',
  viewWorlds: 'View Worlds',
  upcomingClasses: 'Upcoming Classes',
  viewAll: 'View All',
  noUpcomingClasses: 'No upcoming classes',
  noUpcomingClassesHint: 'View available classes to book.',
  viewClasses: 'View classes',
  skills: 'Skills',
  skillsEmpty: 'Skills will appear as you learn',
  skillsEmptyHint: 'Complete lessons and quizzes to build your skill profile.',
  studyGroups: 'Study Groups',
  noStudyGroupsYet: 'No study groups yet',
  noStudyGroupsHint: 'Join or create a group to study with others.',
  browseStudyGroups: 'Browse study groups',
  quickActions: 'Quick actions',
  aiTutor: 'AI Tutor',
  missions: 'Missions',
  myClasses: 'My classes',
  errorLoading: 'Something went wrong loading your dashboard.',
  retry: 'Retry',
  loadingDashboard: 'Loading your dashboard...',
} as const

export type DashboardStringKey = keyof typeof dashboardStrings

/** Get the student dashboard copy (English). */
export function getDashboardStrings() {
  return dashboardStrings
}
