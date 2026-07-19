document.addEventListener('DOMContentLoaded', () => {
    // Harita merkez koordinatları
    const centerLatLng = [39.8662, 32.7215];
    
    // Haritayı yakın bir zoom (18) ile başlat
    window.myMap = L.map('map').setView(centerLatLng, 18);

    // Google Uydu + Etiketler (Hybrid) katmanı
    L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 21,
        attribution: '© Google Maps'
    }).addTo(window.myMap);

    // Site konumuna basit bir işaretçi (Marker) eklendi (Kırmızı kutu yerine)
    const marker = L.marker(centerLatLng).addTo(window.myMap);
    marker.bindPopup("<b>Site Konumu</b><br>Yönetim bölgesi.");

    // Harita ölçek kontrolü (Metre gösterimi)
    L.control.scale({ imperial: false }).addTo(window.myMap);

    // Özel Zoom Seviyesi Göstergesi (Leaflet Control)
    const ZoomViewer = L.Control.extend({
        onAdd: function() {
            const container = L.DomUtil.create('div');
            container.style.backgroundColor = 'rgba(0,0,0,0.6)';
            container.style.color = '#fff';
            container.style.padding = '5px 10px';
            container.style.borderRadius = '5px';
            container.style.fontSize = '12px';
            container.style.fontWeight = 'bold';
            container.style.border = '1px solid rgba(255,255,255,0.2)';
            container.style.backdropFilter = 'blur(4px)';
            container.innerHTML = `Zoom Seviyesi: ${window.myMap.getZoom()}`;
            container.id = 'zoom-level-display';
            return container;
        }
    });

    const zoomViewerControl = new ZoomViewer({ position: 'topright' });
    zoomViewerControl.addTo(window.myMap);

    // Zoom değiştiğinde göstergeyi anlık güncelle
    window.myMap.on('zoomend', function() {
        const display = document.getElementById('zoom-level-display');
        if (display) {
            display.innerHTML = `Zoom Seviyesi: ${window.myMap.getZoom()}`;
        }
    });

    window.loadParcelsToMap = async function() {
        // Haritadaki eski parcel katmanlarını temizle
        if (window.parcelLayers && window.parcelLayers.length > 0) {
            window.parcelLayers.forEach(layer => window.myMap.removeLayer(layer));
        }
        window.parcelLayers = [];

        try {
            const daireler = await ipcRenderer.invoke('get-daireler');
            const paymentStatuses = await ipcRenderer.invoke('get-all-daire-payment-status');
            
            const sessionRole = sessionStorage.getItem('userRole');
            const sessionDaireId = sessionStorage.getItem('userDaireId');
            
            daireler.forEach(async daire => {
                if (daire.koordinat_dosyasi && (daire.koordinat_formati === 'KML' || daire.koordinat_formati === 'Geo JSON')) {
                    try {
                        let text = daire.koordinat_dosyasi;
                        if (text.startsWith('data:')) {
                            const base64Data = text.split(',')[1];
                            text = decodeURIComponent(escape(atob(base64Data)));
                        }
                        
                        let layer;
                        
                        const isOwnDaire = (sessionRole === 'sakin' && daire.id.toString() === sessionDaireId);
                        const isAdmin = (sessionRole === 'yonetici' || !sessionRole);
                            
                        let unpaidText = '';
                        if (isAdmin || isOwnDaire) {
                            const daireUnpaid = await ipcRenderer.invoke('get-daire-unpaid-details', daire.id);
                            
                            if (daireUnpaid.length > 0) {
                                const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
                                const formattedUnpaid = daireUnpaid.map(a => {
                                    const tip = a.tur === 'ekstra' ? 'Ekstra' : 'Aidat';
                                    return `${aylar[a.ay - 1]} ${a.yil} (${tip})`;
                                }).join('<br>');
                                unpaidText = `<br><b style="color:#e74c3c; margin-top:5px; display:inline-block;">Ödenmemiş Ödemeler:</b><br><span style="font-size:11px; color:#c0392b;">${formattedUnpaid}</span>`;
                            } else {
                                unpaidText = `<br><b style="color:#27ae60; margin-top:5px; display:inline-block;">Ödenmemiş Ödemeler:</b> Yok`;
                            }
                        }

                        let popupContent = `
                            <b>Ada:</b> ${daire.adano || '-'}<br>
                            <b>Parsel:</b> ${daire.parselno || '-'}<br>
                            <b>Sakin:</b> ${daire.sakin_ad || 'Bilinmiyor'}`;
                            
                        if (isAdmin || isOwnDaire) {
                            popupContent += `<br>
                            <b>Telefon:</b> ${daire.sakin_telefon || '-'}<br>
                            <b>Email:</b> ${daire.sakin_mail || '-'}${unpaidText}`;
                        }

                        let daireColor;
                        if (sessionRole === 'sakin') {
                            daireColor = '#3b82f6'; // default blue
                        } else {
                            daireColor = paymentStatuses[daire.id] || '#10b981';
                        }

                        const customStyle = function() {
                            return { color: '#3b82f6', weight: (isOwnDaire ? 4 : 2), fillColor: daireColor, fillOpacity: (sessionRole === 'sakin' ? 0.3 : 0.6) };
                        };

                        const labelText = `${daire.blok} / ${daire.daire_no}`;
                        const customLayer = L.geoJson(null, {
                            style: customStyle,
                                onEachFeature: function(feature, layer) {
                                    layer.bindPopup(popupContent);
                                    layer.bindTooltip(labelText, {
                                        permanent: true,
                                        direction: 'center',
                                        className: 'parcel-label'
                                    });
                                }
                            });

                            if (daire.koordinat_formati === 'KML') {
                                layer = omnivore.kml.parse(text, null, customLayer);
                            } else if (daire.koordinat_formati === 'Geo JSON') {
                                layer = L.geoJSON(JSON.parse(text), {
                                    style: customStyle,
                                    onEachFeature: function(feature, layer) {
                                        layer.bindPopup(popupContent);
                                        layer.bindTooltip(labelText, {
                                            permanent: true,
                                            direction: 'center',
                                            className: 'parcel-label'
                                        });
                                    }
                                });
                            }
                            
                            if (layer) {
                                layer.addTo(window.myMap);
                                window.parcelLayers.push(layer);
                            }
                    } catch (e) {
                        console.error("Koordinat dosyası parse hatası:", e);
                    }
                }
            });
        } catch (err) {
            console.error("Parsel verileri yüklenemedi", err);
        }
    };

    // İlk açılışta yükle
    window.loadParcelsToMap();
});
