/**
 * XERA Professional Page Settings - React Component (Island)
 */
(function() {
    const React = window.React;

    function ProSettings({ pageId, onClose, onSaveSuccess }) {
        const [pageData, setPageData] = React.useState(null);
        const [loading, setLoading] = React.useState(true);
        const [saving, setSaving] = React.useState(false);
        const [formData, setFormData] = React.useState({
            name: '',
            bio: '',
            description: '',
            industry: '',
            website_url: '',
            social_links: {
                twitter: '',
                linkedin: '',
                github: '',
                instagram: ''
            },
            hiring_needs: '',
            talent_interests: '',
            avatar_url: '',
            banner_url: ''
        });

        React.useEffect(() => {
            fetchPageData();
        }, [pageId]);

        async function fetchPageData() {
            try {
                const { data, error } = await window.supabase
                    .from('professional_pages')
                    .select('*')
                    .eq('id', pageId)
                    .single();

                if (error) throw error;
                setPageData(data);
                setFormData({
                    name: data.name || '',
                    bio: data.bio || '',
                    description: data.description || '',
                    industry: data.industry || '',
                    website_url: data.website_url || '',
                    social_links: {
                        twitter: data.social_links?.twitter || '',
                        linkedin: data.social_links?.linkedin || '',
                        github: data.social_links?.github || '',
                        instagram: data.social_links?.instagram || '',
                        ...(data.social_links || {})
                    },
                    hiring_needs: (data.hiring_needs || []).join(', '),
                    talent_interests: (data.talent_interests || []).join(', '),
                    avatar_url: data.avatar_url || '',
                    banner_url: data.banner_url || ''
                });
            } catch (err) {
                console.error("Error fetching pro page:", err);
                alert("Erreur lors du chargement des données.");
            } finally {
                setLoading(false);
            }
        }

        const handleInputChange = (e) => {
            const { name, value } = e.target;
            setFormData(prev => ({ ...prev, [name]: value }));
        };

        const handleSocialChange = (e) => {
            const { name, value } = e.target;
            setFormData(prev => ({
                ...prev,
                social_links: { ...prev.social_links, [name]: value }
            }));
        };

        const handleFileUpload = async (e, type) => {
            const file = e.target.files[0];
            if (!file) return;

            const path = `pro-pages/${type === 'avatar' ? 'avatars' : 'banners'}`;
            const res = await window.uploadFile(file, path);

            if (res.success) {
                setFormData(prev => ({
                    ...prev,
                    [type === 'avatar' ? 'avatar_url' : 'banner_url']: res.url
                }));
            } else {
                alert("Upload failed: " + res.error);
            }
        };

        const handleSubmit = async (e) => {
            e.preventDefault();
            setSaving(true);

            const hiringNeedsArr = formData.hiring_needs.split(',').map(s => s.trim()).filter(Boolean);
            const talentInterestsArr = formData.talent_interests.split(',').map(s => s.trim()).filter(Boolean);

            try {
                const { error } = await window.supabase
                    .from('professional_pages')
                    .update({
                        name: formData.name,
                        bio: formData.bio,
                        description: formData.description,
                        industry: formData.industry,
                        website_url: formData.website_url,
                        social_links: formData.social_links,
                        hiring_needs: hiringNeedsArr,
                        talent_interests: talentInterestsArr,
                        avatar_url: formData.avatar_url,
                        banner_url: formData.banner_url,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', pageId);

                if (error) throw error;

                window.showToast?.("Réglages mis à jour !");
                if (onSaveSuccess) onSaveSuccess(formData);
                onClose();
            } catch (err) {
                alert("Erreur lors de la sauvegarde: " + err.message);
            } finally {
                setSaving(false);
            }
        };

        if (loading) return React.createElement('div', { className: 'p-10 text-center text-white' }, 'Chargement...');

        return React.createElement('div', {
            className: 'pro-settings-react bg-white text-black p-8 border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] max-w-2xl w-full max-h-[90vh] overflow-y-auto'
        }, [
            React.createElement('div', { className: 'flex justify-between items-center mb-8' }, [
                React.createElement('h2', { className: 'text-3xl font-black uppercase italic' }, 'Réglages Page Pro'),
                React.createElement('button', {
                    onClick: onClose,
                    className: 'text-4xl font-bold hover:scale-110 transition-transform'
                }, '×')
            ]),

            React.createElement('form', { onSubmit: handleSubmit, className: 'space-y-6' }, [
                // Identité visuelle
                React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b-2 border-gray-100' }, [
                    React.createElement('div', null, [
                        React.createElement('label', { className: 'block font-bold mb-2 uppercase text-sm' }, 'Logo'),
                        React.createElement('div', { className: 'flex items-center gap-4' }, [
                            React.createElement('img', {
                                src: formData.avatar_url || 'icons/enterprise.svg',
                                className: 'w-20 h-20 border-2 border-black object-cover rounded-xl'
                            }),
                            React.createElement('input', {
                                type: 'file',
                                accept: 'image/*',
                                onChange: (e) => handleFileUpload(e, 'avatar'),
                                className: 'text-xs'
                            })
                        ])
                    ]),
                    React.createElement('div', null, [
                        React.createElement('label', { className: 'block font-bold mb-2 uppercase text-sm' }, 'Bannière'),
                        React.createElement('div', { className: 'flex flex-col gap-2' }, [
                            formData.banner_url && React.createElement('img', {
                                src: formData.banner_url,
                                className: 'w-full h-12 border-2 border-black object-cover rounded-md'
                            }),
                            React.createElement('input', {
                                type: 'file',
                                accept: 'image/*',
                                onChange: (e) => handleFileUpload(e, 'banner'),
                                className: 'text-xs'
                            })
                        ])
                    ])
                ]),

                // Infos de base
                React.createElement('div', { className: 'space-y-4' }, [
                    React.createElement('div', null, [
                        React.createElement('label', { className: 'block font-bold mb-1 uppercase text-xs' }, 'Nom de l\'organisation'),
                        React.createElement('input', {
                            type: 'text',
                            name: 'name',
                            value: formData.name,
                            onChange: handleInputChange,
                            className: 'w-full p-3 border-2 border-black font-bold focus:bg-yellow-50 outline-none',
                            required: true
                        })
                    ]),
                    React.createElement('div', null, [
                        React.createElement('label', { className: 'block font-bold mb-1 uppercase text-xs' }, 'Slogan / Bio courte'),
                        React.createElement('input', {
                            type: 'text',
                            name: 'bio',
                            value: formData.bio,
                            onChange: handleInputChange,
                            className: 'w-full p-3 border-2 border-black font-medium focus:bg-yellow-50 outline-none',
                            placeholder: 'Ex: Façonner le futur de l\'IA'
                        })
                    ]),
                    React.createElement('div', null, [
                        React.createElement('label', { className: 'block font-bold mb-1 uppercase text-xs' }, 'Description détaillée'),
                        React.createElement('textarea', {
                            name: 'description',
                            value: formData.description,
                            onChange: handleInputChange,
                            className: 'w-full p-3 border-2 border-black font-medium focus:bg-yellow-50 outline-none min-h-[100px]',
                            placeholder: 'Racontez votre histoire...'
                        })
                    ])
                ]),

                // Momentum Signals
                React.createElement('div', { className: 'bg-yellow-50 p-6 space-y-4 border-2 border-black' }, [
                    React.createElement('h3', { className: 'font-black uppercase text-sm mb-4 border-b-2 border-black pb-2' }, 'Signaux Momentum Engine'),
                    React.createElement('div', null, [
                        React.createElement('label', { className: 'block font-bold mb-1 text-xs' }, 'Besoins Actuels (Recrutement/Collab)'),
                        React.createElement('input', {
                            type: 'text',
                            name: 'hiring_needs',
                            value: formData.hiring_needs,
                            onChange: handleInputChange,
                            className: 'w-full p-2 border-2 border-black text-sm',
                            placeholder: 'React, Design, Product Manager...'
                        })
                    ]),
                    React.createElement('div', null, [
                        React.createElement('label', { className: 'block font-bold mb-1 text-xs' }, 'Centres d\'intérêts (Tags Talent)'),
                        React.createElement('input', {
                            type: 'text',
                            name: 'talent_interests',
                            value: formData.talent_interests,
                            onChange: handleInputChange,
                            className: 'w-full p-2 border-2 border-black text-sm',
                            placeholder: 'AI, Web3, GreenTech...'
                        })
                    ])
                ]),

                // Liens & Réseaux
                React.createElement('div', { className: 'bg-gray-50 p-6 space-y-4 border-2 border-black' }, [
                    React.createElement('h3', { className: 'font-black uppercase text-sm mb-4 border-b-2 border-black pb-2' }, 'Présence en ligne'),
                    React.createElement('div', null, [
                        React.createElement('label', { className: 'block font-bold mb-1 text-xs' }, 'Site Web Officiel'),
                        React.createElement('input', {
                            type: 'url',
                            name: 'website_url',
                            value: formData.website_url,
                            onChange: handleInputChange,
                            className: 'w-full p-2 border-2 border-black text-sm',
                            placeholder: 'https://votre-site.com'
                        })
                    ]),
                    React.createElement('div', { className: 'grid grid-cols-2 gap-4' }, [
                        ['twitter', 'X (Twitter)'],
                        ['linkedin', 'LinkedIn'],
                        ['github', 'GitHub'],
                        ['instagram', 'Instagram']
                    ].map(([key, label]) => (
                        React.createElement('div', { key }, [
                            React.createElement('label', { className: 'block font-bold mb-1 text-xs' }, label),
                            React.createElement('input', {
                                type: 'text',
                                name: key,
                                value: formData.social_links?.[key] || '',
                                onChange: handleSocialChange,
                                className: 'w-full p-2 border-2 border-black text-sm',
                                placeholder: '@username'
                            })
                        ])
                    )))
                ]),

                // Actions
                React.createElement('div', { className: 'flex gap-4 pt-6' }, [
                    React.createElement('button', {
                        type: 'button',
                        onClick: onClose,
                        className: 'flex-1 p-4 border-4 border-black font-black uppercase hover:bg-gray-100 transition-colors'
                    }, 'Annuler'),
                    React.createElement('button', {
                        type: 'submit',
                        disabled: saving,
                        className: `flex-1 p-4 border-4 border-black bg-black text-white font-black uppercase hover:bg-gray-800 transition-colors ${saving ? 'opacity-50' : ''}`
                    }, saving ? 'Sauvegarde...' : 'Enregistrer les modifications ✨')
                ])
            ])
        ]);
    }

    // Export function to mount the component
    window.mountProSettings = function(containerEl, pageId, onClose) {
        const root = window.ReactDOM.createRoot(containerEl);
        root.render(React.createElement(ProSettings, {
            pageId,
            onClose: () => {
                root.unmount();
                onClose();
            },
            onSaveSuccess: (updatedData) => {
                // Rafraîchir le profil entreprise
                if (window.professionalManager) {
                    window.professionalManager.renderProPage(updatedData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
                }
            }
        }));
    };
})();
