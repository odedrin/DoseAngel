import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTourTarget } from '@/store/tourTargets';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Onboarding tour targets — one per tab icon, so TourOverlay can draw a
  // second highlight around whichever tab a step lives on. See
  // store/TourContext.tsx (TAB_TARGET_ID) and components/TourOverlay.tsx.
  const exploreTabRef = useTourTarget('tab.explore');
  const planTabRef = useTourTarget('tab.plan');
  const interactionsTabRef = useTourTarget('tab.interactions');
  const settingsTabRef = useTourTarget('tab.settings');

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: isDark ? '#4ECDC4' : Colors[colorScheme].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7',
          borderTopColor: isDark ? '#2c2c2e' : '#d1d1d6',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Live',
          tabBarIcon: ({ color }) => (
            <View ref={exploreTabRef}>
              <IconSymbol size={26} name="waveform.path.ecg" color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ color }) => (
            <View ref={planTabRef}>
              <IconSymbol size={26} name="calendar" color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="interactions"
        options={{
          title: 'Combos',
          tabBarIcon: ({ color }) => (
            <View ref={interactionsTabRef}>
              <IconSymbol size={26} name="exclamationmark.triangle.fill" color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <View ref={settingsTabRef}>
              <IconSymbol size={26} name="gearshape.fill" color={color} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
