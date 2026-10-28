import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { Product, CartItem, FilterState, CurrencyCode, Currency, Order, User } from '../types';
import { PRODUCTS, CATEGORIES, CURRENCIES } from '../data/mockData';
import { getErrorMessage, isExpiredJwtError, supabase } from '../lib/supabase';

type ScreenName = 'shop' | 'product-detail' | 'cart' | 'checkout' | 'order-success' | 'wishlist' | 'admin' | 'account' | 'explore';

interface ShopContextType {
    products: Product[];
    cart: CartItem[];
    wishlist: string[];
    activeScreen: ScreenName;
    selectedProduct: Product | null;
    currency: Currency;
    setCurrencyCode: (code: CurrencyCode) => void;
    filterState: FilterState;
    setFilterState: React.Dispatch<React.SetStateAction<FilterState>>;
    appliedPromo: string | null;
    discount: number; // in USD
    activeOrder: Order | null;
    orders: Order[];

    // Auth State & Actions
    user: User | null;
    authLoading: boolean;
    isAuthenticated: boolean;
    backendError: string | null;
    clearBackendError: () => void;
    showAuthModal: boolean;
    setShowAuthModal: (show: boolean) => void;
    loginWithGoogle: () => Promise<void>;
    loginWithEmail: (email: string, pass: string) => Promise<void>;
    signupWithEmail: (name: string, email: string, pass: string) => Promise<boolean>;
    logout: () => Promise<void>;
    saveAddress: (address: NonNullable<User['savedAddress']>) => Promise<void>;

    // Navigation & Store Actions
    navigateTo: (screen: ScreenName) => void;
    openProductDetail: (product: Product) => void;
    addToCart: (product: Product, color?: { name: string; hex: string }, qty?: number) => void;
    removeFromCart: (productId: string, colorName: string) => void;
    updateCartQuantity: (productId: string, colorName: string, delta: number) => void;
    toggleWishlist: (productId: string) => Promise<void>;
    isInWishlist: (productId: string) => boolean;
    applyPromoCode: (code: string) => { success: boolean; message: string };
    removePromoCode: () => void;
    placeOrder: (shippingInfo: Order['shippingAddress'], paymentMethod: Order['paymentMethod']) => Promise<Order | null>;
    updateOrderStatus: (orderId: string, status: Order['status']) => Promise<void>;
    addProduct: (product: Omit<Product, 'id'>) => Promise<void>;
    deleteProduct: (productId: string) => Promise<void>;
    formatPrice: (amountInUSD: number) => string;
    cartCount: number;
    cartSubtotal: number; // in USD
    cartTotal: number; // in USD
    shippingCost: number;
    resetFilters: () => void;
}

const initialFilterState: FilterState = {
    category: 'ALL',
    searchQuery: '',
    sortBy: 'featured',
    productType: 'ALL',
    selectedColor: 'ALL',
    maxPrice: 2000,
};

const ShopContext = createContext<ShopContextType | undefined>(undefined);

export const ShopProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [backendError, setBackendError] = useState<string | null>(null);
    const [showAuthModal, setShowAuthModal] = useState(false);

    const clearBackendError = () => setBackendError(null);

    const reportBackendError = (error: unknown) => {
        if (isExpiredJwtError(error)) {
            setBackendError(null);
            setUser(null);
            setOrders([]);
            setWishlist([]);
            setShowAuthModal(true);
            return;
        }
        setBackendError(getErrorMessage(error));
    };

    const loginWithGoogle = async () => {
        clearBackendError();
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: typeof window === 'undefined' ? undefined : window.location.origin,
            },
        });
        if (error) {
            setBackendError(error.message);
            throw error;
        }
    };

    const loginWithEmail = async (email: string, pass: string) => {
        clearBackendError();
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) {
            setBackendError(error.message);
            throw error;
        }
    };

    const signupWithEmail = async (name: string, email: string, pass: string) => {
        clearBackendError();
        const { data, error } = await supabase.auth.signUp({
            email,
            password: pass,
            options: { data: { full_name: name } },
        });
        if (error) {
            setBackendError(error.message);
            throw error;
        }
        return !!data.session;
    };

    const logout = async () => {
        clearBackendError();
        const { error } = await supabase.auth.signOut();
        if (error) {
            setBackendError(error.message);
            throw error;
        }
        setActiveScreen('shop');
    };

    const saveAddress = async (address: NonNullable<User['savedAddress']>) => {
        clearBackendError();
        const { error } = await supabase.rpc('save_shipping_address', { address });
        if (error) {
            reportBackendError(error);
            throw error;
        }
        setUser((currentUser) => currentUser ? { ...currentUser, savedAddress: address } : currentUser);
    };

    const [cart, setCart] = useState<CartItem[]>([]);
    const [wishlist, setWishlist] = useState<string[]>([]);
    const [activeScreen, setActiveScreen] = useState<ScreenName>('shop');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(PRODUCTS[0]);
    const [currency, setCurrency] = useState<Currency>(CURRENCIES[0]);
    const [filterState, setFilterState] = useState<FilterState>(initialFilterState);
    const [appliedPromo, setAppliedPromo] = useState<string | null>('PAPY20');
    const [activeOrder, setActiveOrder] = useState<Order | null>(null);

    useEffect(() => {
        let mounted = true;
        let authRequest = 0;

        const loadAccountData = async (authUser: { id: string; email?: string; user_metadata: Record<string, unknown>; app_metadata: Record<string, unknown> }) => {
            const requestId = ++authRequest;
            setAuthLoading(true);
            try {
                const [{ data: profile, error: profileError }, { data: orderRows, error: orderError }, { data: wishlistRows, error: wishlistError }] = await Promise.all([
                    supabase.from('profiles').select('full_name, avatar_url, saved_address, role').eq('id', authUser.id).maybeSingle(),
                    supabase.from('orders').select('*').order('created_at', { ascending: false }),
                    supabase.from('wishlist_items').select('product_id'),
                ]);
                if (profileError) throw profileError;
                if (orderError) throw orderError;
                if (wishlistError) throw wishlistError;
                if (!mounted || requestId !== authRequest) return;

                const metadata = authUser.user_metadata;
                const displayName = profile?.full_name || metadata.full_name || authUser.email?.split('@')[0] || 'Member';
                setUser({
                    id: authUser.id,
                    name: String(displayName),
                    email: authUser.email || '',
                    avatar: profile?.avatar_url || (typeof metadata.avatar_url === 'string' ? metadata.avatar_url : undefined),
                    provider: authUser.app_metadata.provider === 'google' ? 'google' : 'email',
                    role: profile?.role === 'admin' ? 'admin' : 'customer',
                    savedAddress: profile?.saved_address as User['savedAddress'] | undefined,
                });
                setOrders((orderRows || []).map((row) => ({
                    ...row,
                    items: row.items as CartItem[],
                    shippingAddress: row.shipping_address as Order['shippingAddress'],
                    paymentMethod: row.payment_method as Order['paymentMethod'],
                    estimatedDelivery: row.estimated_delivery,
                } as Order)));
                setWishlist((wishlistRows || []).map((row) => row.product_id));
            } catch (error) {
                if (!mounted || requestId !== authRequest) return;
                reportBackendError(error);
            } finally {
                if (mounted && requestId === authRequest) setAuthLoading(false);
            }
        };

        const loadProducts = async () => {
            try {
                const { data, error } = await supabase
                    .from('products')
                    .select('id, data')
                    .order('created_at', { ascending: false });
                if (error) throw error;
                if (mounted) {
                    const categoryIds = new Set(CATEGORIES.map((category) => category.id));
                    const catalogProducts = (data || [])
                        .map((row) => ({ ...row.data, id: row.id } as Product))
                        .filter((product) => categoryIds.has(product.category));
                    setProductList(catalogProducts.length > 0 ? catalogProducts : PRODUCTS);
                }
            } catch (error) {
                if (mounted) reportBackendError(error);
            }
        };

        void loadProducts();
        supabase.auth.getSession().then(({ data, error }) => {
            if (error) throw error;
            if (data.session) {
                void loadAccountData(data.session.user);
            } else if (mounted) {
                setAuthLoading(false);
            }
        }).catch((error: unknown) => {
            if (mounted) {
                reportBackendError(error);
                setAuthLoading(false);
            }
        });

        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                void loadAccountData(session.user);
            } else {
                authRequest += 1;
                setUser(null);
                setOrders([]);
                setWishlist([]);
                if (event !== 'INITIAL_SESSION') setAuthLoading(false);
            }
        });

        return () => {
            mounted = false;
            authListener.subscription.unsubscribe();
        };
    }, []);

    const setCurrencyCode = (code: CurrencyCode) => {
        const found = CURRENCIES.find((c) => c.code === code);
        if (found) setCurrency(found);
    };

    const navigateTo = (screen: ScreenName) => {
        setActiveScreen(screen);
        if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const openProductDetail = (product: Product) => {
        setSelectedProduct(product);
        navigateTo('product-detail');
    };

    const addToCart = (
        product: Product,
        color?: { name: string; hex: string },
        qty: number = 1
    ) => {
        const chosenColor = color || product.colors[0];

        setCart((prev) => {
            const existingIndex = prev.findIndex(
                (item) =>
                    item.product.id === product.id &&
                    item.selectedColor.name === chosenColor.name
            );

            if (existingIndex > -1) {
                const next = [...prev];
                next[existingIndex].quantity += qty;
                return next;
            } else {
                return [
                    ...prev,
                    {
                        product,
                        selectedColor: chosenColor,
                        quantity: qty,
                    },
                ];
            }
        });
    };

    const removeFromCart = (productId: string, colorName: string) => {
        setCart((prev) =>
            prev.filter(
                (item) =>
                    !(
                        item.product.id === productId &&
                        item.selectedColor.name === colorName
                    )
            )
        );
    };

    const updateCartQuantity = (
        productId: string,
        colorName: string,
        delta: number
    ) => {
        setCart((prev) =>
            prev
                .map((item) => {
                    if (
                        item.product.id === productId &&
                        item.selectedColor.name === colorName
                    ) {
                        const newQty = item.quantity + delta;
                        return newQty > 0 ? { ...item, quantity: newQty } : null;
                    }
                    return item;
                })
                .filter(Boolean) as CartItem[]
        );
    };

    const toggleWishlist = async (productId: string) => {
        clearBackendError();
        if (!user) {
            setShowAuthModal(true);
            return;
        }

        const isSaved = wishlist.includes(productId);
        const query = isSaved
            ? supabase.from('wishlist_items').delete().eq('user_id', user.id).eq('product_id', productId)
            : supabase.from('wishlist_items').insert({ user_id: user.id, product_id: productId });
        const { error } = await query;
        if (error) {
            reportBackendError(error);
            return;
        }
        setWishlist((prev) => isSaved ? prev.filter((id) => id !== productId) : [...prev, productId]);
    };

    const isInWishlist = (productId: string) => wishlist.includes(productId);

    const applyPromoCode = (code: string) => {
        const clean = code.trim().toUpperCase();
        if (clean === 'PAPY20' || clean === '20100' || clean === 'SALE20' || clean === 'WEARISM20') {
            setAppliedPromo(clean);
            return { success: true, message: '$20 discount applied!' };
        }
        return { success: false, message: 'Invalid coupon code. Try code: PAPY20' };
    };

    const removePromoCode = () => {
        setAppliedPromo(null);
    };

    const cartCount = useMemo(() => {
        return cart.reduce((total, item) => total + item.quantity, 0);
    }, [cart]);

    const cartSubtotal = useMemo(() => {
        return cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    }, [cart]);

    const discount = useMemo(() => {
        if (!appliedPromo) return 0;
        return cartSubtotal >= 50 ? 20 : 0;
    }, [appliedPromo, cartSubtotal]);

    const shippingCost = useMemo(() => {
        if (cartSubtotal === 0) return 0;
        return cartSubtotal >= 100 || appliedPromo === 'PAPY20' ? 0 : 15;
    }, [cartSubtotal, appliedPromo]);

    const cartTotal = useMemo(() => {
        const total = cartSubtotal - discount + shippingCost;
        return total > 0 ? total : 0;
    }, [cartSubtotal, discount, shippingCost]);

    const formatPrice = (amountInUSD: number) => {
        const converted = amountInUSD * currency.rate;
        if (currency.code === 'FCFA') {
            return `${Math.round(converted).toLocaleString()} FCFA`;
        }
        return `${currency.symbol}${converted.toFixed(2)}`;
    };

    const resetFilters = () => {
        setFilterState(initialFilterState);
    };

    const [productList, setProductList] = useState<Product[]>(PRODUCTS);
    const [orders, setOrders] = useState<Order[]>([]);

    const updateOrderStatus = async (orderId: string, status: Order['status']) => {
        clearBackendError();
        const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
        if (error) {
            reportBackendError(error);
            return;
        }
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
        if (activeOrder && activeOrder.id === orderId) {
            setActiveOrder((prev) => (prev ? { ...prev, status } : null));
        }
    };

    const addProduct = async (newP: Omit<Product, 'id'>) => {
        clearBackendError();
        const created: Product = {
            ...newP,
            id: `papy-custom-${Date.now()}`,
        };
        const { error } = await supabase.from('products').insert({ id: created.id, data: newP });
        if (error) {
            reportBackendError(error);
            return;
        }
        setProductList((prev) => [created, ...prev]);
    };

    const deleteProduct = async (productId: string) => {
        clearBackendError();
        const { error } = await supabase.from('products').delete().eq('id', productId);
        if (error) {
            reportBackendError(error);
            return;
        }
        setProductList((prev) => prev.filter((p) => p.id !== productId));
    };

    const placeOrder = async (
        shippingInfo: Order['shippingAddress'],
        paymentMethod: Order['paymentMethod']
    ): Promise<Order | null> => {
        clearBackendError();
        if (!user) {
            setShowAuthModal(true);
            return null;
        }

        const newOrder: Order = {
            id: `PAPY-${Math.floor(100000 + Math.random() * 900000)}`,
            date: new Date().toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            }),
            items: [...cart],
            subtotal: cartSubtotal,
            discount,
            shipping: shippingCost,
            total: cartTotal,
            currency: currency.code,
            shippingAddress: shippingInfo,
            paymentMethod,
            status: 'placed',
            estimatedDelivery: 'Demain avant 17h (Express Gratuit)',
        };

        const { error } = await supabase.from('orders').insert({
            id: newOrder.id,
            user_id: user.id,
            date: newOrder.date,
            items: newOrder.items,
            subtotal: newOrder.subtotal,
            discount: newOrder.discount,
            shipping: newOrder.shipping,
            total: newOrder.total,
            currency: newOrder.currency,
            shipping_address: shippingInfo,
            payment_method: newOrder.paymentMethod,
            status: newOrder.status,
            estimated_delivery: newOrder.estimatedDelivery,
        });
        if (error) {
            reportBackendError(error);
            throw error;
        }
        setActiveOrder(newOrder);
        setOrders((prev) => [newOrder, ...prev]);
        setCart([]); // Vide le panier après commande réussie

        // Pour TMoney/Flooz → ne pas naviguer tout de suite (PayDunya confirme async)
        const isMobileMoney = paymentMethod === 'tmoney' || paymentMethod === 'flooz';
        if (!isMobileMoney) {
            navigateTo('order-success');
        }
        return newOrder;
    };


    return (
        <ShopContext.Provider
            value={{
                products: productList,
                cart,
                wishlist,
                activeScreen,
                selectedProduct,
                currency,
                setCurrencyCode,
                filterState,
                setFilterState,
                appliedPromo,
                discount,
                activeOrder,
                orders,
                user,
                authLoading,
                isAuthenticated: !!user,
                backendError,
                clearBackendError,
                showAuthModal,
                setShowAuthModal,
                loginWithGoogle,
                loginWithEmail,
                signupWithEmail,
                logout,
                saveAddress,
                navigateTo,
                openProductDetail,
                addToCart,
                removeFromCart,
                updateCartQuantity,
                toggleWishlist,
                isInWishlist,
                applyPromoCode,
                removePromoCode,
                placeOrder,
                updateOrderStatus,
                addProduct,
                deleteProduct,
                formatPrice,
                cartCount,
                cartSubtotal,
                cartTotal,
                shippingCost,
                resetFilters,
            }}
        >
            {children}
        </ShopContext.Provider>
    );
};

export const useShop = () => {
    const context = useContext(ShopContext);
    if (!context) {
        throw new Error('useShop must be used within a ShopProvider');
    }
    return context;
};
