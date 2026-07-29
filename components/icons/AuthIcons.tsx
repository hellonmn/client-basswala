// components/icons/AuthIcons.tsx
import React from 'react';
import LockSvg from '@/assets/icons/lock.svg';
import UserSvg from '@/assets/icons/user.svg';
// Import all your SVGs

export const LockIcon = ({ color = "#8696a0", size = 20 }) => (
  <LockSvg width={size} height={size} fill={color} stroke={color} />
);

export const UserIcon = ({ color = "#8696a0", size = 20 }) => (
  <UserSvg width={size} height={size} fill={color} stroke={color} />
);

// ... export all your icons