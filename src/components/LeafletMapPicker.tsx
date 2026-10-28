import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { LocalizedText as Text, LocalizedTextInput as TextInput } from '../context/LanguageContext';
import { Feather, Ionicons } from '@expo/vector-icons';

interface LeafletMapPickerProps {
    onSelectAddress: (data: { address: string; city: string; postalCode: string; lat?: number; lng?: number }) => void;
    currentAddress?: string;
}

interface Coordinates {
    lat: number;
    lng: number;
}

interface GeocodedPlace {
    display_name: string;
    lat: string;
    lon: string;
    address?: {
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        county?: string;
        postcode?: string;
    };
}

const isGeocodedPlace = (value: unknown): value is GeocodedPlace =>
    typeof value === 'object'
    && value !== null
    && 'display_name' in value
    && typeof value.display_name === 'string'
    && 'lat' in value
    && typeof value.lat === 'string'
    && 'lon' in value
    && typeof value.lon === 'string';

export const LeafletMapPicker: React.FC<LeafletMapPickerProps> = ({ onSelectAddress, currentAddress }) => {
    const { height: windowHeight } = useWindowDimensions();
    const [modalVisible, setModalVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState(currentAddress || 'Lomé, Togo');
    const [selectedCoords, setSelectedCoords] = useState<Coordinates>({
        lat: 6.1319,
        lng: 1.2228,
    });
    const [selectedPlace, setSelectedPlace] = useState<GeocodedPlace | null>(null);
    const [searching, setSearching] = useState(false);
    const [locating, setLocating] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [mapError, setMapError] = useState('');
    const mapFrameRef = useRef<HTMLIFrameElement>(null);
    const mapHeight = Math.max(210, windowHeight - 360);

    useEffect(() => {
        const handleMapMessage = (event: MessageEvent<unknown>) => {
            if (event.source !== mapFrameRef.current?.contentWindow || typeof event.data !== 'object' || event.data === null) {
                return;
            }
            if (!('type' in event.data) || event.data.type !== 'leaflet-location') return;
            if (!('lat' in event.data) || !('lng' in event.data)) return;

            const { lat, lng } = event.data;
            if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
                return;
            }

            setSelectedCoords({ lat, lng });
            setSelectedPlace(null);
            setMapError('');
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('message', handleMapMessage);
            return () => window.removeEventListener('message', handleMapMessage);
        }
    }, []);

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            setMapError('Saisis une adresse ou une ville à rechercher.');
            return;
        }

        setSearching(true);
        setMapError('');
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(searchQuery.trim())}`
            );
            if (!response.ok) {
                throw new Error(`La recherche d’adresse a échoué (HTTP ${response.status}).`);
            }

            const results: unknown = await response.json();
            if (!Array.isArray(results) || !isGeocodedPlace(results[0])) {
                setMapError('Aucune adresse trouvée. Essaie avec une rue, une ville ou un quartier.');
                return;
            }

            const place = results[0];
            const lat = Number(place.lat);
            const lng = Number(place.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                throw new Error('La recherche a renvoyé des coordonnées invalides.');
            }

            setSelectedCoords({ lat, lng });
            setSelectedPlace(place);
            setSearchQuery(place.display_name);
        } catch (error) {
            setMapError(error instanceof Error ? error.message : String(error));
        } finally {
            setSearching(false);
        }
    };

    const handleLocateMe = () => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            setMapError('La géolocalisation n’est pas disponible sur cet appareil.');
            return;
        }

        setLocating(true);
        setMapError('');
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
                setSelectedCoords({ lat: coords.latitude, lng: coords.longitude });
                setSelectedPlace(null);
                setLocating(false);
            },
            (error) => {
                setMapError(`Impossible de récupérer ta position : ${error.message}`);
                setLocating(false);
            },
            { enableHighAccuracy: true, timeout: 10000 },
        );
    };

    const handleConfirmLocation = async () => {
        setConfirming(true);
        setMapError('');
        try {
            let place = selectedPlace;
            if (!place) {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${selectedCoords.lat}&lon=${selectedCoords.lng}`
                );
                if (!response.ok) {
                    throw new Error(`Impossible de trouver l’adresse du point choisi (HTTP ${response.status}).`);
                }
                const result: unknown = await response.json();
                if (!isGeocodedPlace(result)) {
                    throw new Error('Aucune adresse n’a été trouvée pour ce point.');
                }
                place = result;
            }

            const locationAddress = place.address;
            onSelectAddress({
                address: place.display_name,
                city: locationAddress?.city
                    || locationAddress?.town
                    || locationAddress?.village
                    || locationAddress?.municipality
                    || locationAddress?.county
                    || '',
                postalCode: locationAddress?.postcode || '',
                lat: selectedCoords.lat,
                lng: selectedCoords.lng,
            });
            setSearchQuery(place.display_name);
            setSelectedPlace(place);
            setModalVisible(false);
        } catch (error) {
            setMapError(error instanceof Error ? error.message : String(error));
        } finally {
            setConfirming(false);
        }
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.mapTriggerBtn}
                onPress={() => setModalVisible(true)}
                activeOpacity={0.8}
            >
                <View style={styles.triggerIcon}>
                    <Ionicons name="location-outline" size={20} color="#111111" />
                </View>
                <View style={styles.triggerTextWrapper}>
                    <Text style={styles.triggerTitle}>Pin exact location on Leaflet Map</Text>
                    <Text style={styles.triggerSub} numberOfLines={1}>
                        {currentAddress || 'Search for an address or select a point on the map'}
                    </Text>
                </View>
                <Feather name="chevron-right" size={18} color="#525252" />
            </TouchableOpacity>

            <Modal
                visible={modalVisible}
                animationType="fade"
                transparent
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.mapModalContainer}>
                        <View style={styles.modalHeader}>
                            <View style={styles.headerTitleRow}>
                                <Ionicons name="location-outline" size={22} color="#111111" />
                                <View>
                                    <Text style={styles.modalTitle}>Choose delivery location</Text>
                                    <Text style={styles.modalSubtitle}>Search an address or move the map pin</Text>
                                </View>
                            </View>
                            <TouchableOpacity
                                style={styles.closeBtn}
                                onPress={() => setModalVisible(false)}
                                accessibilityLabel="Close map"
                            >
                                <Feather name="x" size={18} color="#111111" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.searchRow}>
                            <View style={styles.searchBarWrapper}>
                                <Feather name="search" size={17} color="#525252" />
                                <TextInput
                                    style={styles.searchInput}
                                    placeholder="Street, city or postal code"
                                    value={searchQuery}
                                    onChangeText={(value) => {
                                        setSearchQuery(value);
                                        setMapError('');
                                    }}
                                    onSubmitEditing={handleSearch}
                                    returnKeyType="search"
                                />
                            </View>
                            <TouchableOpacity
                                style={styles.searchBtn}
                                onPress={handleSearch}
                                disabled={searching}
                                accessibilityLabel="Search address"
                            >
                                {searching
                                    ? <ActivityIndicator size="small" color="#ffffff" />
                                    : <Feather name="arrow-right" size={18} color="#ffffff" />}
                            </TouchableOpacity>
                        </View>

                        {mapError ? <Text style={styles.mapError}>{mapError}</Text> : null}

                        <View style={[styles.mapViewFrame, { height: mapHeight }]}>
                            <iframe
                                ref={mapFrameRef}
                                title="Leaflet Map"
                                style={{ width: '100%', height: '100%', border: 'none' }}
                                srcDoc={`
                                    <!DOCTYPE html>
                                    <html>
                                      <head>
                                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
                                        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
                                        <style>
                                          html, body, #map { width: 100%; height: 100%; margin: 0; }
                                          .leaflet-control-zoom a { color: #111 !important; }
                                          .leaflet-control-attribution { font-size: 10px !important; }
                                        </style>
                                      </head>
                                      <body>
                                        <div id="map"></div>
                                        <script>
                                          const map = L.map('map').setView([${selectedCoords.lat}, ${selectedCoords.lng}], 15);
                                          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                                            attribution: '&copy; OpenStreetMap contributors',
                                            maxZoom: 19
                                          }).addTo(map);
                                          const marker = L.marker([${selectedCoords.lat}, ${selectedCoords.lng}], { draggable: true }).addTo(map);
                                          const notifyParent = (point) => window.parent.postMessage({
                                            type: 'leaflet-location',
                                            lat: point.lat,
                                            lng: point.lng
                                          }, '*');
                                          map.on('click', (event) => {
                                            marker.setLatLng(event.latlng);
                                            notifyParent(event.latlng);
                                          });
                                          marker.on('dragend', () => notifyParent(marker.getLatLng()));
                                          setTimeout(() => map.invalidateSize(), 100);
                                        </script>
                                      </body>
                                    </html>
                                `}
                            />
                            <TouchableOpacity
                                style={styles.locateBtn}
                                onPress={handleLocateMe}
                                disabled={locating}
                                accessibilityLabel="Use my current location"
                            >
                                {locating
                                    ? <ActivityIndicator size="small" color="#ffffff" />
                                    : <Ionicons name="locate-outline" size={22} color="#ffffff" />}
                            </TouchableOpacity>
                            <View style={styles.pinInfoBadge}>
                                <Ionicons name="pin-outline" size={14} color="#111111" />
                                <Text style={styles.pinInfoText}>
                                    {selectedCoords.lat.toFixed(5)}, {selectedCoords.lng.toFixed(5)}
                                </Text>
                            </View>
                        </View>

                        <Text style={styles.mapHint}>Tap the map or drag the pin to adjust your delivery point.</Text>
                        <TouchableOpacity
                            style={styles.confirmLocationBtn}
                            onPress={handleConfirmLocation}
                            disabled={confirming}
                            activeOpacity={0.8}
                        >
                            {confirming
                                ? <ActivityIndicator size="small" color="#ffffff" />
                                : <Feather name="check" size={18} color="#ffffff" />}
                            <Text style={styles.confirmBtnText}>
                                {confirming ? 'Finding address...' : 'Confirm this location'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: 10,
    },
    mapTriggerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 16,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#d4d4d4',
        gap: 12,
    },
    triggerIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
    },
    triggerTextWrapper: {
        flex: 1,
    },
    triggerTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#111111',
    },
    triggerSub: {
        fontSize: 12,
        color: '#525252',
        marginTop: 2,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    mapModalContainer: {
        width: '100%',
        maxWidth: 1200,
        flex: 1,
        height: '100%',
        backgroundColor: '#ffffff',
        borderRadius: 20,
        padding: 20,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: '#111111',
    },
    modalSubtitle: {
        fontSize: 12,
        color: '#525252',
        marginTop: 2,
    },
    closeBtn: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    searchBarWrapper: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        borderRadius: 12,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: '#d4d4d4',
        gap: 10,
    },
    searchInput: {
        flex: 1,
        minWidth: 0,
        paddingVertical: 12,
        fontSize: 14,
        color: '#111111',
    },
    searchBtn: {
        width: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#111111',
    },
    mapError: {
        color: '#111111',
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 10,
    },
    mapViewFrame: {
        flex: 0,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#f5f5f5',
        position: 'relative',
    },
    locateBtn: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: '#111111',
        borderWidth: 1,
        borderColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.16,
        shadowRadius: 4,
        elevation: 3,
    },
    pinInfoBadge: {
        position: 'absolute',
        bottom: 12,
        left: 12,
        backgroundColor: '#ffffff',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    },
    pinInfoText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#111111',
    },
    mapHint: {
        fontSize: 12,
        color: '#525252',
        marginTop: 8,
        marginBottom: 8,
    },
    confirmLocationBtn: {
        minHeight: 50,
        backgroundColor: '#111111',
        borderRadius: 14,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    confirmBtnText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 0.3,
    },
});
