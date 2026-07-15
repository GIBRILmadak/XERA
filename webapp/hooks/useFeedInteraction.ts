import { useState } from 'react';

export const useFeedInteraction = (itemId: string, initialSubscribed: boolean, initialLiked: boolean) => {
    // Initial State - Optimized
    const [isSubscribed, setIsSubscribed] = useState(initialSubscribed);
    const [isLiked, setIsLiked] = useState(initialLiked);
    const [likesCount, setLikesCount] = useState(0); // Should be fetched from item

    // Handlers
    const toggleSubscribe = async () => {
        const previousState = isSubscribed;
        setIsSubscribed(!isSubscribed); // Optimistic UI
        try {
            await fetch('/api/app/interaction/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ interaction_type: 'follow', target_user_id: itemId })
            });
        } catch (e) {
            setIsSubscribed(previousState); // Rollback
        }
    };

    const toggleLike = async () => {
        const previousState = isLiked;
        setIsLiked(!isLiked); // Optimistic UI
        setLikesCount(prev => isLiked ? Math.max(0, prev - 1) : prev + 1);
        try {
            await fetch('/api/app/interaction/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ interaction_type: 'encourage', target_user_id: itemId })
            });
        } catch (e) {
            setIsLiked(previousState); // Rollback
            setLikesCount(prev => previousState ? prev + 1 : Math.max(0, prev - 1));
        }
    };

    return {
        isSubscribed,
        toggleSubscribe,
        isLiked,
        toggleLike,
        likesCount
    };
};
