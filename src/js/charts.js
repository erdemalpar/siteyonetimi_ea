let aidatChartInstance = null;

window.updateChart = function (odenen, odemeyen) {
    const ctx = document.getElementById('aidatChart').getContext('2d');

    if (aidatChartInstance) {
        aidatChartInstance.data.datasets[0].data = [odenen, odemeyen];
        aidatChartInstance.update();
        return;
    }

    aidatChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Ödeyenler', 'Ödemeyenler'],
            datasets: [{
                data: [odenen, odemeyen],
                backgroundColor: [
                    '#10b981', // success
                    '#ef4444'  // danger
                ],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#f8fafc',
                        font: {
                            family: 'Outfit',
                            size: 14
                        }
                    }
                }
            }
        }
    });
};
