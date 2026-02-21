// SF Property Embeddings Explorer - Assignment 4
// Embedding-centered visualization with coordinated views

let fullData = null;
let sampledData = null;
let embeddingData = null;

let currentProjection = 'pca';
let currentColorField = 'total_assessed_value';
let currentSizeField = 'none';

let SAMPLE_SIZE = 5000;
const DETAIL_SAMPLE_SIZE = 5000;

let brushSelection = null;
let currentDataFile = 'embeddings_2d.json';

let attributeFilters = {
    valueRange: null,
    neighborhoods: null,
    years: null,
    zipCodes: null
};

const ZIP_GEOJSON_URL = 'San_Francisco_ZIP_Codes_20251020.geojson';
let zipFeatures = null;
let choroplethMetric = 'median_value';

let controlsInitialized = false;

document.addEventListener('DOMContentLoaded', () => {
    loadData(currentDataFile);
});

async function ensureZipFeaturesLoaded() {
    if (zipFeatures) return;
    try {
        const res = await fetch(ZIP_GEOJSON_URL);
        if (!res.ok) {
            throw new Error(`HTTP error (${res.status}) while loading ${ZIP_GEOJSON_URL}`);
        }
        const geojson = await res.json();
        if (!geojson.features || !Array.isArray(geojson.features)) {
            throw new Error('ZIP GeoJSON does not contain a features array');
        }
        zipFeatures = geojson.features;
        console.log('Loaded ZIP GeoJSON with', zipFeatures.length, 'features');
    } catch (err) {
        console.error('Failed to load ZIP GeoJSON:', err);
        zipFeatures = null;
    }
}

function assignZipCodes(data) {
    if (!zipFeatures || !data) return;
    data.forEach(d => {
        if (d.zip_code != null && d.zip_code !== '') return;
        const lon = d.longitude;
        const lat = d.latitude;
        if (lon == null || lat == null) return;
        const zip = findZipForPoint(lon, lat);
        if (zip) {
            d.zip_code = String(zip);
        }
    });
}

function findZipForPoint(lon, lat) {
    if (!zipFeatures) return null;
    for (const f of zipFeatures) {
        const geom = f.geometry;
        if (!geom || !geom.coordinates) continue;
        const props = f.properties || {};
        const zipProp = props.zip_code || props.zip || props.id;
        if (!zipProp) continue;

        if (geom.type === 'Polygon') {
            const rings = geom.coordinates;
            for (const ring of rings) {
                if (pointInRing(lon, lat, ring)) return zipProp;
            }
        } else if (geom.type === 'MultiPolygon') {
            const polygons = geom.coordinates;
            for (const poly of polygons) {
                for (const ring of poly) {
                    if (pointInRing(lon, lat, ring)) return zipProp;
                }
            }
        }
    }
    return null;
}

// Ray casting algorithm for point-in-polygon
function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > lat) !== (yj > lat)) && 
                         (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

async function loadData(filename) {
    try {
        await ensureZipFeaturesLoaded();
        const res = await fetch(filename);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        
        const jsonData = await res.json();
        fullData = jsonData.map((d, i) => ({
            ...d,
            property_id: d.property_id ?? i,
            total_assessed_value: +d.total_assessed_value,
            property_area: d.property_area ? +d.property_area : null,
            number_of_bedrooms: d.number_of_bedrooms != null ? +d.number_of_bedrooms : null,
            number_of_bathrooms: d.number_of_bathrooms != null ? +d.number_of_bathrooms : null,
            building_age: d.building_age != null ? +d.building_age : null,
            year: +d.year,
            latitude: d.latitude != null ? +d.latitude : null,
            longitude: d.longitude != null ? +d.longitude : null,
            pca_x: d.pca_x != null ? +d.pca_x : null,
            pca_y: d.pca_y != null ? +d.pca_y : null,
            tsne_x: d.tsne_x != null ? +d.tsne_x : null,
            tsne_y: d.tsne_y != null ? +d.tsne_y : null,
            neighborhood: d.neighborhood || 'Unknown',
            zip_code: d.zip_code || null
        }));

        assignZipCodes(fullData);
        
        sampledData = sampleData(fullData, SAMPLE_SIZE);
        embeddingData = sampledData;

        console.log('Loaded data:', fullData.length, 'records');
        console.log('Sampled:', sampledData.length, 'records');

        initControls();
        renderAll();
    } catch (err) {
        console.error('Failed to load data:', err);
        document.getElementById('embedding-view').innerHTML = 
            `<div class="error-message">Error loading data: ${err.message}</div>`;
    }
}

function sampleData(data, size) {
    if (data.length <= size) return data;
    const step = Math.floor(data.length / size);
    return data.filter((_, i) => i % step === 0).slice(0, size);
}

function initControls() {
    if (controlsInitialized) return;
    controlsInitialized = true;

    const sampleInput = document.getElementById('sample-size-input');
    const sampleLabel = document.getElementById('sample-size-label');
    const resampleBtn = document.getElementById('resample-btn');
    const projectionSelect = document.getElementById('projection-select');
    const colorSelect = document.getElementById('color-select');
    const sizeSelect = document.getElementById('size-select');

    // ✅ New year filter controls (dropdown with checkboxes)
    const yearFilterToggle = document.getElementById('year-filter-toggle');
    const yearFilterDropdown = document.getElementById('year-filter-dropdown');
    const yearCheckboxes = document.querySelectorAll('[data-year-option]');

    const clearFiltersBtn = document.getElementById('clear-filters-btn');
    const choroplethSelect = document.getElementById('choropleth-metric');

    // Year filter dropdown toggle (only if elements exist)
    if (yearFilterToggle && yearFilterDropdown) {
        // Start hidden regardless of CSS, so we never see all years at once
        yearFilterDropdown.style.display = 'none';

        yearFilterToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = yearFilterDropdown.style.display === 'block';
            yearFilterDropdown.style.display = isOpen ? 'none' : 'block';
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!yearFilterToggle.contains(e.target) && !yearFilterDropdown.contains(e.target)) {
                yearFilterDropdown.style.display = 'none';
            }
        });

        // Handle year checkbox changes
        yearCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const allYearsCheckbox = document.querySelector('[data-year-option][value="all"]');
                
                if (checkbox.value === 'all') {
                    // If "All Years" is checked, uncheck all individual years
                    if (checkbox.checked) {
                        yearCheckboxes.forEach(cb => {
                            if (cb.value !== 'all') cb.checked = false;
                        });
                        attributeFilters.years = null;
                        yearFilterToggle.textContent = 'All Years ▼';
                        console.log('📅 Year filter: Cleared (showing all years)');
                    }
                } else {
                    // If any individual year is checked, uncheck "All Years"
                    allYearsCheckbox.checked = false;
                    
                    // Get all checked years
                    const checkedYears = Array.from(yearCheckboxes)
                        .filter(cb => cb.value !== 'all' && cb.checked)
                        .map(cb => parseInt(cb.value));
                    
                    if (checkedYears.length === 0) {
                        // No years selected = show all
                        allYearsCheckbox.checked = true;
                        attributeFilters.years = null;
                        yearFilterToggle.textContent = 'All Years ▼';
                        console.log('📅 Year filter: Cleared (showing all years)');
                    } else {
                        // Some years selected
                        attributeFilters.years = new Set(checkedYears);
                        const yearText = checkedYears.length === 1 
                            ? `${checkedYears[0]} ▼`
                            : `${checkedYears.length} Years ▼`;
                        yearFilterToggle.textContent = yearText;
                        console.log('📅 Year filter: Set to', checkedYears.join(', '));
                    }
                }
                
                renderEmbedding();
                renderValueHistogram();
                renderNeighborhoodBars();
                renderYearTrends();
                renderMapView();
                renderChoropleth();
                renderParallelCoords();
                renderSizeValueScatter();
                updateFilterSummary();
                updateSelectionStats();
            });
        });
    } else {
        console.warn('Year filter elements not found - using old HTML?');
    }

    sampleInput.addEventListener('input', () => {
        sampleLabel.textContent = (+sampleInput.value).toLocaleString();
    });

    resampleBtn.addEventListener('click', () => {
        SAMPLE_SIZE = +sampleInput.value;
        sampledData = sampleData(fullData, SAMPLE_SIZE);
        embeddingData = sampledData;
        brushSelection = null;
        attributeFilters = {valueRange: null, neighborhoods: null, years: null, zipCodes: null};
        // Reset year checkboxes (if they exist)
        if (yearCheckboxes.length > 0 && yearFilterToggle) {
            yearCheckboxes.forEach(cb => {
                if (cb.value === 'all') {
                    cb.checked = true;
                } else {
                    cb.checked = false;
                }
            });
            yearFilterToggle.textContent = 'All Years ▼';
            if (yearFilterDropdown) {
                yearFilterDropdown.style.display = 'none';
            }
        }
        renderAll();
    });

    projectionSelect.addEventListener('change', () => {
        currentProjection = projectionSelect.value;
        renderAll();
    });

    colorSelect.addEventListener('change', () => {
        currentColorField = colorSelect.value;
        renderAll();
    });

    sizeSelect.addEventListener('change', () => {
        currentSizeField = sizeSelect.value;
        renderAll();
    });

    clearFiltersBtn.addEventListener('click', () => {
        brushSelection = null;
        attributeFilters = {valueRange: null, neighborhoods: null, years: null, zipCodes: null};
        // Reset year checkboxes (if they exist)
        if (yearCheckboxes.length > 0 && yearFilterToggle) {
            yearCheckboxes.forEach(cb => {
                if (cb.value === 'all') {
                    cb.checked = true;
                } else {
                    cb.checked = false;
                }
            });
            yearFilterToggle.textContent = 'All Years ▼';
            if (yearFilterDropdown) {
                yearFilterDropdown.style.display = 'none';
            }
        }
        renderAll();
    });

    choroplethSelect.addEventListener('change', () => {
        choroplethMetric = choroplethSelect.value;
        renderChoropleth();
    });
}

function getSubset() {
    let subset = embeddingData;

    if (brushSelection && brushSelection.length > 0) {
        const idSet = new Set(brushSelection.map(d => d.property_id));
        subset = subset.filter(d => idSet.has(d.property_id));
    }

    if (attributeFilters.valueRange) {
        const [min, max] = attributeFilters.valueRange;
        subset = subset.filter(d => d.total_assessed_value >= min && d.total_assessed_value <= max);
    }

    if (attributeFilters.neighborhoods && attributeFilters.neighborhoods.size > 0) {
        subset = subset.filter(d => attributeFilters.neighborhoods.has(d.neighborhood));
    }

    if (attributeFilters.years && attributeFilters.years.size > 0) {
        subset = subset.filter(d => attributeFilters.years.has(d.year));
    }

    if (attributeFilters.zipCodes && attributeFilters.zipCodes.size > 0) {
        subset = subset.filter(d => d.zip_code && attributeFilters.zipCodes.has(d.zip_code));
    }

    return subset;
}

function renderAll() {
    renderEmbedding();
    renderValueHistogram();
    renderNeighborhoodBars();
    renderYearTrends();
    renderMapView();
    renderChoropleth();
    renderParallelCoords();
    renderSizeValueScatter();
    updateFilterSummary();
    updateSelectionStats();
}

function updateFilterSummary() {
    const parts = [];
    if (attributeFilters.valueRange) {
        const [min, max] = attributeFilters.valueRange;
        parts.push(`Value: $${min.toLocaleString()}-$${max.toLocaleString()}`);
    }
    if (attributeFilters.neighborhoods && attributeFilters.neighborhoods.size > 0) {
        parts.push(`Neighborhoods: ${attributeFilters.neighborhoods.size}`);
    }
    if (attributeFilters.years && attributeFilters.years.size > 0) {
        parts.push(`Years: ${Array.from(attributeFilters.years).sort().join(', ')}`);
    }
    if (attributeFilters.zipCodes && attributeFilters.zipCodes.size > 0) {
        parts.push(`ZIPs: ${attributeFilters.zipCodes.size}`);
    }
    if (brushSelection && brushSelection.length > 0) {
        parts.push(`Brush: ${brushSelection.length} properties`);
    }

    const el = document.getElementById('active-filters');
    el.textContent = parts.length > 0 ? `Filters: ${parts.join(' | ')}` : 'Filters: none (showing all sampled properties)';
}

function updateSelectionStats() {
    const subset = getSubset();
    const el = document.getElementById('selection-stats');
    if (subset.length === 0) {
        el.textContent = 'Current subset: —';
        return;
    }
    const count = subset.length;
    const values = subset.map(d => d.total_assessed_value).filter(v => v != null);
    const median = values.length > 0 ? d3.median(values) : 0;
    el.textContent = `Current subset: ${count.toLocaleString()} properties | Median value: $${median.toLocaleString('en-US', {maximumFractionDigits: 0})}`;
}

function renderEmbedding() {
    const xField = `${currentProjection}_x`;
    const yField = `${currentProjection}_y`;

    let validData = embeddingData.filter(d => d[xField] != null && d[yField] != null);
    const totalPoints = validData.length;
    
    // Track which filters are active
    const activeFilters = [];

    // Apply brushSelection first
    if (brushSelection && brushSelection.length > 0) {
        const idSet = new Set(brushSelection.map(d => d.property_id));
        validData = validData.filter(d => idSet.has(d.property_id));
        activeFilters.push(`Brush: ${brushSelection.length} properties`);
        console.log(`  After brush: ${validData.length} points`);
    }

    // Apply attribute filters
    if (attributeFilters.valueRange) {
        const [min, max] = attributeFilters.valueRange;
        const before = validData.length;
        validData = validData.filter(d => d.total_assessed_value >= min && d.total_assessed_value <= max);
        activeFilters.push(`Value: $${(min/1000).toFixed(0)}k-$${(max/1000).toFixed(0)}k`);
        console.log(`  After value filter: ${validData.length} points (removed ${before - validData.length})`);
    }
    
    if (attributeFilters.neighborhoods && attributeFilters.neighborhoods.size > 0) {
        const before = validData.length;
        validData = validData.filter(d => attributeFilters.neighborhoods.has(d.neighborhood));
        activeFilters.push(`Neighborhoods: ${Array.from(attributeFilters.neighborhoods).join(', ')}`);
        console.log(`  After neighborhood filter: ${validData.length} points (removed ${before - validData.length})`);
    }
    
    if (attributeFilters.years && attributeFilters.years.size > 0) {
        const before = validData.length;
        validData = validData.filter(d => attributeFilters.years.has(d.year));
        activeFilters.push(`Years: ${Array.from(attributeFilters.years).sort().join(', ')}`);
        console.log(`  After year filter: ${validData.length} points (removed ${before - validData.length})`);
    }
    
    if (attributeFilters.zipCodes && attributeFilters.zipCodes.size > 0) {
        const before = validData.length;
        validData = validData.filter(d => d.zip_code && attributeFilters.zipCodes.has(d.zip_code));
        activeFilters.push(`ZIPs: ${Array.from(attributeFilters.zipCodes).join(', ')}`);
        console.log(`  After ZIP filter: ${validData.length} points (removed ${before - validData.length})`);
    }

    console.log(`🎯 Embedding: ${validData.length} of ${totalPoints} points | Active filters: ${activeFilters.length ? activeFilters.join(' + ') : 'none'}`);

    const colorScale = getColorScale(currentColorField);
    const sizeScale = getSizeScale(currentSizeField);

    const spec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {values: validData},
        width: 'container',
        height: 'container',
        params: [{
            name: 'brush',
            select: {type: 'interval', encodings: ['x', 'y']}
        }],
        mark: {type: 'circle', opacity: 0.6},
        encoding: {
            x: {
                field: xField, 
                type: 'quantitative', 
                title: `${currentProjection.toUpperCase()} X`, 
                scale: {zero: false}
            },
            y: {
                field: yField, 
                type: 'quantitative', 
                title: `${currentProjection.toUpperCase()} Y`, 
                scale: {zero: false}
            },
            color: colorScale,
            size: sizeScale,
            tooltip: [
                {field: 'property_id', type: 'nominal', title: 'ID'},
                {field: 'neighborhood', type: 'nominal', title: 'Neighborhood'},
                {field: 'year', type: 'quantitative', title: 'Year'},
                {field: 'total_assessed_value', type: 'quantitative', format: '$,.0f', title: 'Value'},
                {field: 'property_area', type: 'quantitative', format: ',.0f', title: 'Area (sqft)'},
                {field: 'number_of_bedrooms', type: 'quantitative', title: 'Bedrooms'},
                {field: 'building_age', type: 'quantitative', title: 'Age (years)'}
            ]
        }
    };

    vegaEmbed('#embedding-view', spec, {actions: false}).then(result => {
        result.view.addSignalListener('brush', (name, value) => {
            if (!value || Object.keys(value).length === 0) {
                brushSelection = null;
            } else {
                const [xMin, xMax] = value[xField] || [null, null];
                const [yMin, yMax] = value[yField] || [null, null];
                if (xMin != null && xMax != null && yMin != null && yMax != null) {
                    // Get the original valid data before filters for brushing
                    const originalValid = embeddingData.filter(d => d[xField] != null && d[yField] != null);
                    brushSelection = originalValid.filter(d =>
                        d[xField] >= xMin && d[xField] <= xMax &&
                        d[yField] >= yMin && d[yField] <= yMax
                    );
                    console.log(`👆 User brushed: ${brushSelection.length} points selected`);
                } else {
                    brushSelection = null;
                }
            }
            renderValueHistogram();
            renderNeighborhoodBars();
            renderYearTrends();
            renderMapView();
            renderChoropleth();
            renderParallelCoords();
            renderSizeValueScatter();
            updateFilterSummary();
            updateSelectionStats();
        });
    }).catch(err => {
        console.error('Error rendering embedding:', err);
    });
}

function getColorScale(field) {
    const categoricalFields = ['neighborhood'];
    if (categoricalFields.includes(field)) {
        return {field, type: 'nominal', scale: {scheme: 'category10'}, title: getFieldTitle(field)};
    } else {
        return {field, type: 'quantitative', scale: {scheme: 'viridis'}, title: getFieldTitle(field)};
    }
}

function getSizeScale(field) {
    if (field === 'none') {
        return {value: 30};
    } else {
        return {field, type: 'quantitative', scale: {range: [20, 300]}, title: getFieldTitle(field)};
    }
}

function getFieldTitle(field) {
    const titles = {
        'total_assessed_value': 'Property Value ($)',
        'building_age': 'Building Age (years)',
        'year': 'Year',
        'neighborhood': 'Neighborhood',
        'number_of_bedrooms': 'Bedrooms',
        'property_area': 'Area (sqft)'
    };
    return titles[field] || field;
}

function renderValueHistogram() {
    const subset = getSubset();
    if (subset.length === 0) {
        document.getElementById('value-histogram').innerHTML = '<div class="loading">No data</div>';
        return;
    }

    const spec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {values: subset},
        width: 'container',
        height: 'container',
        params: [{
            name: 'valueBrush',
            select: {type: 'interval', encodings: ['x']}
        }],
        mark: 'bar',
        encoding: {
            x: {
                field: 'total_assessed_value',
                type: 'quantitative',
                bin: {maxbins: 30},
                title: 'Property Value ($)',
                axis: {format: '$,.0s'}
            },
            y: {aggregate: 'count', title: 'Count'},
            tooltip: [
                {field: 'total_assessed_value', bin: true, title: 'Value Range'},
                {aggregate: 'count', title: 'Count'}
            ]
        }
    };

    vegaEmbed('#value-histogram', spec, {actions: false}).then(result => {
        result.view.addSignalListener('valueBrush', (name, value) => {
            console.log('💰 Value brush event:', value);
            if (!value || !value.total_assessed_value) {
                attributeFilters.valueRange = null;
                console.log('  → Cleared value filter');
            } else {
                attributeFilters.valueRange = value.total_assessed_value;
                console.log('  → Set value range:', attributeFilters.valueRange);
            }
            renderEmbedding();
            renderNeighborhoodBars();
            renderYearTrends();
            renderMapView();
            renderChoropleth();
            renderParallelCoords();
            renderSizeValueScatter();
            updateFilterSummary();
            updateSelectionStats();
        });
    });
}

function renderNeighborhoodBars() {
    const subset = getSubset();
    if (subset.length === 0) {
        document.getElementById('neighborhood-bars').innerHTML = '<div class="loading">No data</div>';
        return;
    }

    const counts = d3.rollup(subset, v => v.length, d => d.neighborhood);
    const top10 = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([neighborhood, count]) => ({neighborhood, count}));

    const spec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {values: top10},
        width: 'container',
        height: 'container',
        params: [{
            name: 'nbhdSelect',
            select: {type: 'point', fields: ['neighborhood'], toggle: 'event.shiftKey'}
        }],
        mark: 'bar',
        encoding: {
            y: {field: 'neighborhood', type: 'nominal', sort: '-x', title: null},
            x: {field: 'count', type: 'quantitative', title: 'Count'},
            color: {
                condition: {param: 'nbhdSelect', value: 'steelblue'},
                value: 'lightgray'
            },
            tooltip: [
                {field: 'neighborhood', title: 'Neighborhood'},
                {field: 'count', title: 'Count'}
            ]
        }
    };

    vegaEmbed('#neighborhood-bars', spec, {actions: false}).then(result => {
        result.view.addSignalListener('nbhdSelect', (name, value) => {
            console.log('🏘️ Neighborhood selection event:', value);
            if (!value || !value.neighborhood || value.neighborhood.length === 0) {
                attributeFilters.neighborhoods = null;
                console.log('  → Cleared neighborhood filter');
            } else {
                attributeFilters.neighborhoods = new Set(value.neighborhood);
                console.log('  → Set neighborhoods:', Array.from(attributeFilters.neighborhoods));
            }
            renderEmbedding();
            renderValueHistogram();
            renderYearTrends();
            renderMapView();
            renderChoropleth();
            renderParallelCoords();
            renderSizeValueScatter();
            updateFilterSummary();
            updateSelectionStats();
        });
    });
}

function renderYearTrends() {
    const subset = getSubset();
    if (subset.length === 0) {
        document.getElementById('year-trends').innerHTML = '<div class="loading">No data</div>';
        return;
    }

    const yearGroups = d3.group(subset, d => d.year);
    const trends = Array.from(yearGroups, ([year, records]) => ({
        year,
        median_value: d3.median(records, d => d.total_assessed_value)
    })).sort((a, b) => a.year - b.year);

    const spec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {values: trends},
        width: 'container',
        height: 'container',
        mark: {type: 'line', point: true, strokeWidth: 2},
        encoding: {
            x: {field: 'year', type: 'ordinal', title: 'Year'},
            y: {field: 'median_value', type: 'quantitative', title: 'Median Value', axis: {format: '$,.0s'}},
            tooltip: [
                {field: 'year', title: 'Year'},
                {field: 'median_value', format: '$,.0f', title: 'Median Value'}
            ]
        }
    };

    vegaEmbed('#year-trends', spec, {actions: false});
}

function renderMapView() {
    const subset = getSubset();
    let mapData = subset.filter(d => d.latitude != null && d.longitude != null);
    
    if (mapData.length > DETAIL_SAMPLE_SIZE) {
        mapData = sampleData(mapData, DETAIL_SAMPLE_SIZE);
    }

    if (mapData.length === 0) {
        document.getElementById('map-view').innerHTML = '<div class="loading">No data</div>';
        return;
    }

    const colorScale = getColorScale(currentColorField);

    const spec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {values: mapData},
        width: 'container',
        height: 'container',
        mark: {type: 'circle', size: 25, opacity: 0.6},
        encoding: {
            longitude: {field: 'longitude', type: 'quantitative'},
            latitude: {field: 'latitude', type: 'quantitative'},
            color: colorScale,
            tooltip: [
                {field: 'neighborhood', title: 'Neighborhood'},
                {field: 'total_assessed_value', format: '$,.0f', title: 'Value'},
                {field: 'year', title: 'Year'}
            ]
        },
        projection: {type: 'mercator'}
    };

    vegaEmbed('#map-view', spec, {actions: false});
}

function renderChoropleth() {
    if (!zipFeatures) {
        document.getElementById('choropleth-view').innerHTML = '<div class="loading">Loading ZIP data...</div>';
        return;
    }

    const subset = getSubset();
    if (subset.length === 0) {
        document.getElementById('choropleth-view').innerHTML = '<div class="loading">No data</div>';
        return;
    }

    const zipGroups = d3.group(subset, d => d.zip_code);
    const zipStats = Array.from(zipGroups, ([zip, records]) => {
        const values = records.map(r => r.total_assessed_value).filter(v => v != null);
        return {
            zip_code: zip,
            count: records.length,
            median_value: values.length > 0 ? d3.median(values) : 0
        };
    });

    const zipMap = new Map(zipStats.map(d => [String(d.zip_code), d]));

    const features = zipFeatures.map(f => {
        const props = f.properties || {};
        const zipProp = String(props.zip_code || props.zip || props.id || '');
        const stats = zipMap.get(zipProp) || {count: 0, median_value: 0};
        return {
            type: 'Feature',
            geometry: f.geometry,
            properties: {
                zip_code: zipProp,
                count: stats.count,
                median_value: stats.median_value
            }
        };
    });

    const metricField = choroplethMetric === 'count' ? 'properties.count' : 'properties.median_value';
    const metricTitle = choroplethMetric === 'count' ? 'Property Count' : 'Median Value ($)';
    const metricFormat = choroplethMetric === 'count' ? ',.0f' : '$,.0f';

    const spec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {values: features},
        width: 'container',
        height: 'container',
        params: [{
            name: 'zipSelect',
            select: {type: 'point', fields: ['properties.zip_code'], toggle: 'event.shiftKey'}
        }],
        mark: {type: 'geoshape', stroke: 'white', strokeWidth: 1},
        encoding: {
            color: {
                field: metricField,
                type: 'quantitative',
                scale: {scheme: 'viridis'},
                title: metricTitle
            },
            tooltip: [
                {field: 'properties.zip_code', type: 'nominal', title: 'ZIP'},
                {field: 'properties.count', type: 'quantitative', format: ',', title: 'Count'},
                {field: 'properties.median_value', type: 'quantitative', format: '$,.0f', title: 'Median Value'}
            ]
        },
        projection: {type: 'mercator'}
    };

    vegaEmbed('#choropleth-view', spec, {actions: false}).then(result => {
        result.view.addSignalListener('zipSelect', (name, value) => {
            console.log('📮 ZIP selection event:', value);
            if (!value || !value['properties.zip_code'] || value['properties.zip_code'].length === 0) {
                attributeFilters.zipCodes = null;
                console.log('  → Cleared ZIP filter');
            } else {
                attributeFilters.zipCodes = new Set(value['properties.zip_code']);
                console.log('  → Set ZIPs:', Array.from(attributeFilters.zipCodes));
            }
            renderEmbedding();
            renderValueHistogram();
            renderNeighborhoodBars();
            renderYearTrends();
            renderMapView();
            renderParallelCoords();
            renderSizeValueScatter();
            updateFilterSummary();
            updateSelectionStats();
        });
    }).catch(err => {
        console.error('Error rendering choropleth:', err);
        document.getElementById('choropleth-view').innerHTML = '<div class="error-message">Error rendering choropleth</div>';
    });
}

function renderParallelCoords() {
    const subset = getSubset();
    let pcData = subset.filter(d =>
        d.total_assessed_value != null &&
        d.property_area != null &&
        d.building_age != null &&
        d.number_of_bedrooms != null
    );

    if (pcData.length > 1000) {
        pcData = sampleData(pcData, 1000);
    }

    if (pcData.length === 0) {
        document.getElementById('parallel-coords').innerHTML = '<div class="loading">No data</div>';
        return;
    }

    // Normalize to 0-1
    const normalize = (arr, getValue) => {
        const values = arr.map(getValue);
        const min = d3.min(values);
        const max = d3.max(values);
        const range = max - min || 1;
        return arr.map(d => ({
            ...d,
            norm_value: (getValue(d) - min) / range
        }));
    };

    const dims = ['total_assessed_value', 'property_area', 'building_age', 'number_of_bedrooms'];
    const normalizedSets = dims.map(dim => normalize(pcData, d => d[dim]));

    const flatData = [];
    pcData.forEach((d, i) => {
        dims.forEach((dim, j) => {
            flatData.push({
                property_id: d.property_id,
                dimension: dim,
                value: d[dim],
                normalized: normalizedSets[j][i].norm_value
            });
        });
    });

    const spec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {values: flatData},
        width: 'container',
        height: 'container',
        mark: {type: 'line', opacity: 0.3},
        encoding: {
            x: {field: 'dimension', type: 'nominal', title: null},
            y: {field: 'normalized', type: 'quantitative', title: 'Normalized Value'},
            detail: {field: 'property_id', type: 'nominal'},
            color: {value: 'steelblue'},
            tooltip: [
                {field: 'dimension', title: 'Dimension'},
                {field: 'value', format: ',.2f', title: 'Value'}
            ]
        }
    };

    vegaEmbed('#parallel-coords', spec, {actions: false});
}

function renderSizeValueScatter() {
    const subset = getSubset();
    const scatterData = subset.filter(d =>
        d.property_area != null &&
        d.total_assessed_value != null &&
        d.property_area > 0 &&
        d.total_assessed_value > 0
    );

    if (scatterData.length === 0) {
        document.getElementById('size-value-scatter').innerHTML = '<div class="loading">No data</div>';
        return;
    }

    scatterData.forEach(d => {
        d.value_per_sqft = d.total_assessed_value / d.property_area;
    });

    const spec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {values: scatterData},
        width: 'container',
        height: 'container',
        mark: {type: 'circle', opacity: 0.5, size: 30},
        encoding: {
            x: {
                field: 'property_area',
                type: 'quantitative',
                scale: {type: 'log'},
                title: 'Property Area (sqft, log scale)'
            },
            y: {
                field: 'total_assessed_value',
                type: 'quantitative',
                scale: {type: 'log'},
                title: 'Property Value ($, log scale)',
                axis: {format: '$,.0s'}
            },
            color: {
                field: 'value_per_sqft',
                type: 'quantitative',
                scale: {scheme: 'viridis'},
                title: 'Value per sqft ($)'
            },
            tooltip: [
                {field: 'neighborhood', title: 'Neighborhood'},
                {field: 'property_area', format: ',.0f', title: 'Area'},
                {field: 'total_assessed_value', format: '$,.0f', title: 'Value'},
                {field: 'value_per_sqft', format: '$,.0f', title: '$ per sqft'}
            ]
        }
    };

    vegaEmbed('#size-value-scatter', spec, {actions: false});
}
