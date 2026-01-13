/**
 * Configuración para Tailwind CSS (CDN Version)
 * Define colores personalizados, fuentes y animaciones.
 */
window.tailwind.config = {
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif']
            },
            colors: {
                theme: {
                    // Colores personalizados del Vivero
                    centro: '#064e3b',       // Verde Oscuro
                    centroLight: '#34d399',  // Verde Claro
                    // CAMBIO 1 y 4: Nuevos colores para Ejemplares (Naranja Tranquilo)
                    ejemplares: '#c2410c',   // Orange 700 (Ladrillo/Naranja oscurecido)
                    ejemplaresLight: '#fb923c', // Orange 400
                    warning: '#f59e0b',
                    danger: '#ef4444'
                }
            },
            animation: {
                'slide-in': 'slideIn 0.3s ease-out forwards',
                'fade-in': 'fadeIn 0.2s ease-out forwards',
            },
            keyframes: {
                slideIn: {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(0)' }
                },
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' }
                }
            }
        }
    }
};
