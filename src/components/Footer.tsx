import React from 'react';
import { StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LocalizedText as Text } from '../context/LanguageContext';
import { useShop } from '../context/ShopContext';

type FooterProps = {
    horizontalBleed?: number;
};

const serviceHighlights: { icon: React.ComponentProps<typeof Feather>['name']; label: string }[] = [
    { icon: 'zap', label: 'Une sélection tech pour tous les jours' },
    { icon: 'smartphone', label: 'Paiement mobile disponible' },
    { icon: 'package', label: 'Suivez vos commandes depuis votre compte' },
];

export const Footer: React.FC<FooterProps> = ({ horizontalBleed = 0 }) => {
    const { navigateTo, setFilterState } = useShop();
    const { width } = useWindowDimensions();
    const isMobile = width < 600;
    const year = new Date().getFullYear();

    const openCategory = (category: string) => {
        setFilterState((previous) => ({ ...previous, category }));
        navigateTo('shop');
    };

    const linkColumn = (
        title: string,
        links: { label: string; onPress: () => void }[],
    ) => (
        <View style={[styles.linkColumn, isMobile && styles.linkColumnMobile]}>
            <Text style={styles.columnTitle}>{title}</Text>
            {links.map((link) => (
                <TouchableOpacity
                    key={link.label}
                    accessibilityRole="button"
                    onPress={link.onPress}
                    style={styles.linkButton}
                    activeOpacity={0.7}
                >
                    <Text style={styles.linkText}>{link.label}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );

    return (
        <View style={[styles.footer, horizontalBleed > 0 && { marginHorizontal: -horizontalBleed }]}>
            <View style={styles.content}>
                <View style={[styles.serviceRow, isMobile && styles.serviceRowMobile]}>
                    {serviceHighlights.map((item) => (
                        <View key={item.label} style={styles.serviceItem}>
                            <View style={styles.serviceIcon}>
                                <Feather name={item.icon} size={17} color="#c7a6ff" />
                            </View>
                            <Text style={styles.serviceText}>{item.label}</Text>
                        </View>
                    ))}
                </View>

                <View style={[styles.mainGrid, isMobile && styles.mainGridMobile]}>
                    <View style={[styles.brandColumn, isMobile && styles.brandColumnMobile]}>
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Zone de Papy"
                            onPress={() => navigateTo('shop')}
                            activeOpacity={0.8}
                            style={styles.brandLockup}
                        >
                            <View style={styles.brandMark}>
                                <Text style={styles.brandMarkText}>ZP</Text>
                            </View>
                            <Text style={styles.brandName}>Zone de Papy</Text>
                        </TouchableOpacity>
                        <Text style={styles.brandDescription}>
                            La technologie utile, soigneusement sélectionnée pour accompagner votre quotidien.
                        </Text>
                    </View>

                    {linkColumn('Découvrir', [
                        { label: 'Toute la boutique', onPress: () => navigateTo('shop') },
                        { label: 'Explorer', onPress: () => navigateTo('explore') },
                        { label: 'Accessoires', onPress: () => openCategory('ACCESSORIES') },
                        { label: 'Jeux vidéo', onPress: () => openCategory('GAMING') },
                    ])}

                    {linkColumn('Votre espace', [
                        { label: 'Mon compte', onPress: () => navigateTo('account') },
                        { label: 'Mes favoris', onPress: () => navigateTo('wishlist') },
                        { label: 'Mon panier', onPress: () => navigateTo('cart') },
                    ])}
                </View>

                <View style={[styles.bottomBar, isMobile && styles.bottomBarMobile]}>
                    <Text style={styles.copyright}>© {year} Zone de Papy. Tous droits réservés.</Text>
                    <Text style={styles.bottomNote}>Pensé pour votre quotidien.</Text>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    footer: {
        backgroundColor: '#11131a',
        marginTop: 52,
        paddingHorizontal: 24,
        paddingTop: 28,
        paddingBottom: 20,
    },
    content: {
        width: '100%',
        maxWidth: 1200,
        alignSelf: 'center',
    },
    serviceRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 16,
        paddingBottom: 26,
        borderBottomWidth: 1,
        borderBottomColor: '#292b34',
    },
    serviceRowMobile: {
        flexDirection: 'column',
        gap: 14,
    },
    serviceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
        minWidth: 210,
    },
    serviceIcon: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#25212f',
        alignItems: 'center',
        justifyContent: 'center',
    },
    serviceText: {
        color: '#d3d4dc',
        fontSize: 12,
        fontWeight: '600',
        flexShrink: 1,
    },
    mainGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 24,
        paddingVertical: 32,
    },
    mainGridMobile: {
        gap: 26,
        paddingVertical: 28,
    },
    brandColumn: {
        width: '34%',
        minWidth: 230,
        paddingRight: 20,
    },
    brandColumnMobile: {
        width: '100%',
        paddingRight: 0,
    },
    brandLockup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        alignSelf: 'flex-start',
    },
    brandMark: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: '#8b5cf6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    brandMarkText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '900',
        letterSpacing: 0.4,
    },
    brandName: {
        color: '#ffffff',
        fontSize: 17,
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    brandDescription: {
        color: '#a5a6b0',
        fontSize: 12,
        lineHeight: 20,
        marginTop: 14,
        maxWidth: 310,
    },
    linkColumn: {
        flex: 1,
        minWidth: 145,
    },
    linkColumnMobile: {
        flexBasis: '44%',
        flexGrow: 1,
    },
    columnTitle: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 14,
    },
    linkButton: {
        alignSelf: 'flex-start',
        paddingVertical: 5,
    },
    linkText: {
        color: '#a5a6b0',
        fontSize: 12,
        fontWeight: '500',
    },
    bottomBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        borderTopWidth: 1,
        borderTopColor: '#292b34',
        paddingTop: 17,
    },
    bottomBarMobile: {
        flexDirection: 'column',
    },
    copyright: {
        color: '#858691',
        fontSize: 10,
    },
    bottomNote: {
        color: '#858691',
        fontSize: 10,
    },
});
