import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useLocation } from '@/context/LocationContext';
import PressableScale from './PressableScale';
import { BORDER_RADIUS, COLORS, FONT_SIZES, FONT_WEIGHTS, SHADOWS, SPACING } from '../constants/theme';

interface LocationBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
}

const savedLocations = [
  { id: '1', type: 'Home', address: '123 Main Street, Jaipur', city: 'Jaipur', area: 'Malviya Nagar' },
  { id: '2', type: 'Work', address: '456 Office Complex, Jaipur', city: 'Jaipur', area: 'Vaishali Nagar' },
];

const nearbyAreas = [
  { id: '1', name: 'Malviya Nagar', city: 'Jaipur', distance: '2 km' },
  { id: '2', name: 'Vaishali Nagar', city: 'Jaipur', distance: '3 km' },
  { id: '3', name: 'C-Scheme', city: 'Jaipur', distance: '4 km' },
  { id: '4', name: 'MI Road', city: 'Jaipur', distance: '5 km' },
  { id: '5', name: 'Raja Park', city: 'Jaipur', distance: '6 km' },
];

export default function LocationBottomSheet({ isVisible, onClose }: LocationBottomSheetProps) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['75%'], []);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  
  const { getCurrentLocation, setManualLocation } = useLocation();

  useEffect(() => {
    if (isVisible) {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [isVisible]);

  const handleDetectLocation = async () => {
    setIsDetecting(true);
    await getCurrentLocation();
    setIsDetecting(false);
    onClose();
  };

  const handleSelectLocation = (location: any) => {
    setManualLocation({
      latitude: 26.9124,
      longitude: 75.7873,
      address: location.address || location.name,
      city: location.city,
      area: location.area || location.name,
    });
    onClose();
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.4}
        pressBehavior="close"
      />
    ),
    []
  );

  const filteredAreas = nearbyAreas.filter(area =>
    area.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.bottomSheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Select Location</Text>
          <PressableScale onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={20} color={COLORS.text} />
          </PressableScale>
        </View>

        {/* Current Location Button */}
        <PressableScale 
          style={styles.detectButton}
          onPress={handleDetectLocation}
          disabled={isDetecting}
          scaleTo={0.98}
        >
          <View style={styles.detectIcon}>
            <Ionicons name="navigate" size={18} color={COLORS.primary} />
          </View>
          <View style={styles.detectText}>
            <Text style={styles.detectTitle}>
              {isDetecting ? 'Detecting Location...' : 'Use Current Location'}
            </Text>
            <Text style={styles.detectSubtitle}>Using precise GPS</Text>
          </View>
          {isDetecting ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          )}
        </PressableScale>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for area, street name..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <PressableScale onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </PressableScale>
          )}
        </View>

        {/* Saved Locations */}
        {savedLocations.length > 0 && !searchQuery && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SAVED LOCATIONS</Text>
            {savedLocations.map((location) => (
              <PressableScale
                key={location.id}
                style={styles.locationItem}
                onPress={() => handleSelectLocation(location)}
                scaleTo={0.98}
              >
                <View style={styles.locationIcon}>
                  <Ionicons 
                    name={location.type === 'Home' ? 'home' : 'briefcase'} 
                    size={18} 
                    color={COLORS.primary} 
                  />
                </View>
                <View style={styles.locationInfo}>
                  <Text style={styles.locationType}>{location.type}</Text>
                  <Text style={styles.locationAddress} numberOfLines={1}>
                    {location.address}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </PressableScale>
            ))}
          </View>
        )}

        {/* Nearby Areas */}
        <View style={styles.sectionFlex}>
          <Text style={styles.sectionTitle}>
            {searchQuery ? 'SEARCH RESULTS' : 'NEARBY AREAS'}
          </Text>
          <FlatList
            data={filteredAreas}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <PressableScale
                style={styles.areaItem}
                onPress={() => handleSelectLocation(item)}
                scaleTo={0.98}
              >
                <View style={styles.areaIcon}>
                  <Ionicons name="location-outline" size={18} color={COLORS.primary} />
                </View>
                <View style={styles.areaInfo}>
                  <Text style={styles.areaName}>{item.name}</Text>
                  <Text style={styles.areaCity}>{item.city}</Text>
                </View>
                <Text style={styles.areaDistance}>{item.distance}</Text>
              </PressableScale>
            )}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  bottomSheetBackground: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
  },
  handleIndicator: {
    backgroundColor: COLORS.border,
    width: 36,
    height: 4,
  },
  container: {
    flex: 1,
    paddingHorizontal: SPACING.md + 4,
    paddingTop: SPACING.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.backgroundSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentLight,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(6, 243, 249, 0.4)',
    ...SHADOWS.soft,
  },
  detectIcon: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm + 4,
  },
  detectText: {
    flex: 1,
  },
  detectTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primaryDark,
  },
  detectSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSubtle,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  section: {
    marginBottom: SPACING.md,
  },
  sectionFlex: {
    flex: 1,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
    letterSpacing: 0.6,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.xs + 2,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.soft,
  },
  locationIcon: {
    width: 34,
    height: 34,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.accentLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm + 4,
  },
  locationInfo: {
    flex: 1,
  },
  locationType: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
  },
  locationAddress: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  areaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md - 2,
    paddingHorizontal: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  areaIcon: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.backgroundSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm + 4,
  },
  areaInfo: {
    flex: 1,
  },
  areaName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
  },
  areaCity: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  areaDistance: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
});