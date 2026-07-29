import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useLocation } from '@/context/LocationContext';

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

  // Control bottom sheet visibility
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
        opacity={0.5}
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
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#101720" />
          </TouchableOpacity>
        </View>

        {/* Current Location Button */}
        <TouchableOpacity 
          style={styles.detectButton}
          onPress={handleDetectLocation}
          disabled={isDetecting}
          activeOpacity={0.7}
        >
          <View style={styles.detectIcon}>
            <Ionicons name="navigate" size={20} color="#02023E" />
          </View>
          <View style={styles.detectText}>
            <Text style={styles.detectTitle}>
              {isDetecting ? 'Detecting...' : 'Use Current Location'}
            </Text>
            <Text style={styles.detectSubtitle}>Using GPS</Text>
          </View>
          {isDetecting ? (
            <ActivityIndicator size="small" color="#02023E" />
          ) : (
            <Ionicons name="chevron-forward" size={20} color="#8696a0" />
          )}
        </TouchableOpacity>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color="#8696a0" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for area, street name..."
            placeholderTextColor="#8696a0"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Saved Locations */}
        {savedLocations.length > 0 && !searchQuery && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SAVED LOCATIONS</Text>
            {savedLocations.map((location) => (
              <TouchableOpacity
                key={location.id}
                style={styles.locationItem}
                onPress={() => handleSelectLocation(location)}
                activeOpacity={0.7}
              >
                <View style={styles.locationIcon}>
                  <Ionicons 
                    name={location.type === 'Home' ? 'home' : 'briefcase'} 
                    size={20} 
                    color="#02023E" 
                  />
                </View>
                <View style={styles.locationInfo}>
                  <Text style={styles.locationType}>{location.type}</Text>
                  <Text style={styles.locationAddress} numberOfLines={1}>
                    {location.address}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#8696a0" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Nearby Areas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {searchQuery ? 'SEARCH RESULTS' : 'NEARBY AREAS'}
          </Text>
          <FlatList
            data={filteredAreas}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.areaItem}
                onPress={() => handleSelectLocation(item)}
                activeOpacity={0.7}
              >
                <View style={styles.areaIcon}>
                  <Ionicons name="location-outline" size={20} color="#8696a0" />
                </View>
                <View style={styles.areaInfo}>
                  <Text style={styles.areaName}>{item.name}</Text>
                  <Text style={styles.areaCity}>{item.city}</Text>
                </View>
                <Text style={styles.areaDistance}>{item.distance}</Text>
              </TouchableOpacity>
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
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleIndicator: {
    backgroundColor: '#e5e7eb',
    width: 40,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#101720',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fffe',
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#02023E',
  },
  detectIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  detectText: {
    flex: 1,
  },
  detectTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101720',
    marginBottom: 2,
  },
  detectSubtitle: {
    fontSize: 13,
    color: '#8696a0',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 24,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#101720',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8696a0',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0fffe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101720',
    marginBottom: 2,
  },
  locationAddress: {
    fontSize: 13,
    color: '#8696a0',
  },
  areaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  areaIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  areaInfo: {
    flex: 1,
  },
  areaName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#101720',
    marginBottom: 2,
  },
  areaCity: {
    fontSize: 13,
    color: '#8696a0',
  },
  areaDistance: {
    fontSize: 13,
    color: '#8696a0',
    fontWeight: '500',
  },
});