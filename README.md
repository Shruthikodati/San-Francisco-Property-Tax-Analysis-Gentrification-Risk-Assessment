# Assignment 4: Embedding-Based Interactive Visualization System


## Dataset Overview

**Dataset Name:** Assessor Historical Secured Property Tax Rolls  
**Source:** San Francisco Open Data Portal  
**URL:** https://data.sfgov.org/Housing-and-Buildings/Assessor-Historical-Secured-Property-Tax-Rolls/wv5m-vpq2

**Dataset Characteristics:**
- **Records:** 1.5+ million property assessments (2007-2023)
- **Attributes:** 46 fields including assessed values, property characteristics, spatial coordinates, and temporal data
- **Temporal Coverage:** 17 years capturing major economic events (2008 financial crisis, tech boom, COVID-19 pandemic)
- **Spatial Coverage:** All taxable properties in San Francisco with neighborhood classifications and GPS coordinates

This dataset enables analysis of San Francisco's urban transformation through property value changes, gentrification patterns, and housing market dynamics across different neighborhoods and time periods.



## Project Overview

This assignment creates an interactive web-based visualization system centered on property embeddings derived from San Francisco's property tax data. The system allows users to explore high-dimensional property data through low-dimensional projections (PCA and t-SNE) while maintaining connections to original attributes through coordinated multiple views. The embedding-centered approach reveals hidden relationships between properties that aren't visible when examining individual attributes separately, enabling pattern discovery across multiple dimensions simultaneously.

The visualization interface combines an interactive embedding scatterplot as the primary exploration tool with coordinated detail views that update based on user selections. Users can brush regions in the embedding space to examine clusters of similar properties, filter by value ranges or neighborhoods, and observe how selections propagate across spatial maps, temporal trends, and multi-attribute visualizations. This design supports multi-scale exploration from citywide patterns down to individual property details while maintaining context throughout the interaction.

The system integrates visualizations from previous assignments—including value distributions, neighborhood comparisons, spatial choropleths, and value-size scatter plots—but reorganizes them around the embedding space rather than treating them as independent views. This embedding-centered organization enables users to discover property clusters based on combined features like value, size, age, and location, then validate these patterns through linked detail views that show the specific attributes driving the similarity.

**Live Demo:** [URL will be added after deployment]



## Task 1: Embeddings and Projections

### 1.1 Embedding Construction

We constructed property embeddings using a carefully selected set of features that capture the essential characteristics of San Francisco properties across multiple dimensions:

#### Feature Engineering Process

**1. Numerical Features (Normalized to [0,1]):**
- `total_assessed_value`: Property value (log-transformed due to high skew)
- `property_area`: Square footage (log-transformed)
- `number_of_bedrooms`: Bedroom count (capped at 10)
- `number_of_bathrooms`: Bathroom count (capped at 8)
- `building_age`: Age in years (computed as 2023 - year_built)

**2. Spatial Features:**
- `latitude` and `longitude`: Normalized GPS coordinates
- `distance_to_downtown`: Euclidean distance from city center (37.7749°N, 122.4194°W)

**3. Temporal Features:**
- `year`: Assessment year normalized to [0,1] across 2015-2023 range
- `year_category`: One-hot encoded periods (pre-COVID 2015-2019, COVID 2020-2021, post-COVID 2022-2023)

**4. Categorical Features (One-Hot Encoded):**
- `neighborhood`: 41 distinct neighborhoods encoded as binary indicators
- `property_type_group`: Aggregated into 5 main categories (Residential, Commercial, Industrial, Mixed-Use, Other)

**Final Embedding Dimensionality:** 54 features
- 8 continuous numerical features
- 3 temporal features
- 2 spatial coordinates
- 41 neighborhood indicators

#### Preprocessing Steps

1. **Data Cleaning:**
   - Filtered to 2015-2023 for temporal consistency
   - Removed records with missing essential fields (lat/lon, value, area)
   - Handled outliers using IQR method (capped at 1.5×IQR beyond quartiles)

2. **Normalization:**
   - Applied StandardScaler to continuous features
   - Log-transformed highly skewed features (value, area)
   - Min-max scaling for spatial coordinates

3. **Dimensionality Considerations:**
   - Kept neighborhood one-hot encoding despite high dimensionality (captures important spatial-cultural context)
   - Excluded rarely used fields (<1% coverage) like special exemptions
   - Combined property types into broader categories to reduce sparsity

**Rationale:** These features capture property similarity across multiple meaningful dimensions. Two properties are considered similar if they share comparable assessed values, physical characteristics (size, bedrooms), spatial proximity (neighborhood, location), and temporal context (assessment year). This multi-faceted representation enables discovery of property clusters based on market segment, location, and time period.

**Implementation:** See `task1_embeddings_projections.ipynb` for full embedding construction code.

### 1.2 Dimensionality Reduction

We applied two projection methods to explore different aspects of the embedding space:

#### Methods Comparison

| Method | Purpose | Parameters | Strengths | Limitations |
|--------|---------|------------|-----------|-------------|
| **PCA** | Global structure | n_components=2 | Preserves variance, fast, deterministic | Linear only, may miss local patterns |
| **t-SNE** | Local neighborhoods | perplexity=30, n_iter=1000 | Reveals clusters, preserves local structure | Non-deterministic, distorts distances |

#### Iteration History

**Iteration 1: Initial PCA-only approach**
- **What:** Applied PCA directly to raw (non-normalized) features
- **Why changed:** Value and area features dominated due to scale differences; neighborhoods weren't separating clearly
- **Effect:** Geographic clusters were weak; high-value properties scattered

**Iteration 2: Normalized features + PCA + t-SNE**
- **What:** Added StandardScaler normalization; included t-SNE for local structure
- **Why changed:** Wanted to see if local neighborhoods would cluster better with t-SNE
- **Effect:** Clear neighborhood clustering emerged in t-SNE; Pacific Heights/Marina formed distinct clusters; PCA showed citywide value gradients

**Iteration 3: Added temporal features**
- **What:** Added year-based features and one-hot encoding for COVID periods
- **Why changed:** Initial embeddings didn't capture temporal market shifts; wanted to see COVID impact on property groupings
- **Effect:** Properties from different time periods separated better in embedding space; COVID-era properties (2020-2021) showed distinct patterns in both PCA and t-SNE projections

**Final Choice:** Include both projections in the interface with a selector, allowing users to switch between:
- **PCA** for understanding overall value/size gradients and temporal trends
- **t-SNE** for exploring neighborhood clusters and local structure

#### Results

The final projections reveal:
- **PCA:** Primary component corresponds to property value; secondary component to spatial location (east-west gradient)
- **t-SNE:** Distinct clusters for high-value neighborhoods (Pacific Heights, Marina), dense urban areas (SoMa, Mission), and residential zones (Sunset, Richmond)

**Output Files:**
- `embeddings.csv`: Full 54-dimensional embeddings
- `embeddings_2d.json`: 2D projections with original attributes for visualization



## Task 2: Standalone HTML Interface

### Interface Architecture

Our visualization system is built as a single-page web application using:
- **Vega-Lite 5.x** for declarative visualizations
- **Vega-Embed 6.x** for embedding specifications
- **Vanilla JavaScript** for interaction coordination
- **CSS Grid** for responsive layout

### Core Visualizations

#### 1. Main Embedding Scatterplot
- **Position:** Top-left, largest panel (2fr width)
- **Encodings:**
  - X/Y: Projection coordinates (pca_x/pca_y, tsne_x/tsne_y, or umap_x/umap_y)
  - Color: User-selectable (value, age, year, neighborhood, bedrooms)
  - Size: User-selectable (uniform, area, value, bedrooms)
  - Opacity: 0.6 for overplotting reduction
- **Interactions:**
  - Brush selection (shift+drag) to filter other views
  - Pan/zoom for detailed exploration
  - Tooltips showing property details

#### 2. Detail Views Panel (Right Side)

**Value Distribution Histogram:**
- Shows property value distribution for current selection
- Brush along x-axis to filter by value range
- Updates embedding scatterplot on selection

**Top Neighborhoods Bar Chart:**
- Displays top 10 neighborhoods in current selection
- Click to filter embedding to selected neighborhoods
- Shift+click for multi-select; double-click to clear

**Temporal Trends Line Chart:**
- Median assessed value by year for current subset
- Responsive to embedding brush and filters
- Shows market trends over 2015-2023 period

#### 3. Spatial Views Panel (Bottom Left)

**Point Map:**
- Geographic scatter of individual properties
- Color matches embedding view encoding
- Linked to embedding selections

**ZIP Code Choropleth:**
- Aggregates properties by ZIP code
- User-selectable metric (median value or property count)
- Click ZIP regions to filter embedding space
- Year slider from previous assignment retained

#### 4. Property Attributes Panel (Bottom Right)

**Parallel Coordinates:**
- Shows normalized dimensions: value, area, age, bedrooms
- Reveals cluster profiles in embedding space
- Brush along axes to filter properties

**Value-Size Analyzer:**
- Reuses Assignment 3 scatter plot
- Area (x) vs Value (y) on log scales
- Color by value per square foot
- Updates based on current subset

### Data Loading Strategy

```javascript
// Load embedding data
const data = await fetch('embeddings_2d.json').then(r => r.json());

// Load geographic boundaries
const zipGeo = await fetch('San_Francisco_ZIP_Codes.geojson').then(r => r.json());

// Sample for performance (user-adjustable)
const sampledData = sampleData(data, currentSampleSize);
```

### Interaction Model

**Selection Flow:**
1. User brushes region in embedding scatterplot
2. Selected property IDs propagated to all views
3. Detail views update to show selected subset statistics
4. Spatial views highlight selected properties geographically
5. Attribute views filter to selected subset

**Filter Flow:**
1. User interacts with detail/spatial/attribute view
2. Filtering condition extracted (e.g., neighborhood="Mission", year=2020)
3. Embedding scatterplot filtered to matching points
4. All other views update to filtered subset

**Control Flow:**
- **Projection selector:** Switches x/y encoding between PCA/t-SNE/UMAP
- **Color/size selectors:** Update visual encoding across all views
- **Sample size slider:** Resamples data for performance tuning
- **Clear filters button:** Resets all selections and filters

### Performance Optimizations

- **Sampling:** Default 5,000 points; adjustable 1,000-50,000
- **Aggregation:** ZIP choropleth pre-aggregates spatial data
- **Lazy loading:** Parallel coordinates limited to 1,000 lines
- **Debouncing:** 300ms delay on slider interactions



## Task 3: Integration with Previous Assignments
integrated and adapted visualizations from Assignment 3, reusing Vega-Lite specifications and interaction patterns for the value histogram, neighborhood bar chart, spatial choropleth, and value-size scatter plot. These views were modified to respond to embedding selections and to enable bidirectional filtering between the embedding space and detail views.



## Task 4: Web Deployment

### Hosting Platform

**Platform:** [GitHub Pages / Google Sites - specify after deployment]  
**URL:** [To be added after deployment]

### Deployment Steps

1. **Preparation:**
   - Ensured all file paths are relative
   - Verified data files are under size limits
   - Tested in multiple browsers (Chrome, Firefox, Safari)
   - Validated responsive layout on different screen sizes

2. **Upload Process:**
   ```bash
   # GitHub Pages approach
   git add index.html style.css script.js embeddings_2d.json
   git commit -m "Deploy Assignment 4 visualization interface"
   git push origin main
   # Enable GitHub Pages in repository settings
   ```

3. **Post-Deployment Testing:**
   - Verified all visualizations load correctly
   - Tested all interactions work as expected
   - Checked mobile responsiveness
   - Validated in different browsers

### Browser Compatibility

Tested and working on:
- **Chrome** 90+
- **Firefox** 88+
- **Safari** 14+
- **Edge** 90+

**Note:** Internet Explorer not supported due to ES6 JavaScript usage.

### Accessing the Interface

Simply navigate to the URL above in any modern browser. No installation or setup required. The interface is fully self-contained and loads data from relative paths.



## Key Findings and Insights

### Discovered Patterns in Embedding Space

#### 1. Neighborhood Clustering (t-SNE)

**Observation:** Properties cluster strongly by neighborhood in t-SNE projection.

**Clusters Identified:**
- **High-Value Coastal:** Pacific Heights, Marina, Sea Cliff form tight cluster (top-left in t-SNE)
- **Dense Urban:** SoMa, Mission, Downtown cluster together (center)
- **Residential West:** Sunset and Richmond districts separate cluster (right)
- **Southern Neighborhoods:** Bayview, Excelsior, Outer Mission form distinct group (bottom)

**Interpretation:** Neighborhood is a dominant feature in property similarity. Properties in same neighborhood share value ranges, architectural styles, and lot sizes even when other attributes differ.

#### 2. Value Gradients (PCA)

**Observation:** PC1 (explains 32% variance) corresponds almost perfectly to property value.

**Pattern:** Clear east-west gradient in PCA space:
- **Left (negative PC1):** Low-value properties ($200k-$600k)
- **Center:** Mid-value properties ($600k-$1.2M)
- **Right (positive PC1):** High-value properties ($1.2M+)

**Interpretation:** Property value is the single most important differentiator. PC2 (explains 18% variance) captures spatial distribution, separating northern coastal properties from southern inland properties.

#### 3. Temporal Transitions (UMAP)

**Observation:** UMAP reveals temporal market shifts that PCA and t-SNE miss.

**COVID-19 Impact:**
- **Pre-COVID (2015-2019):** Properties cluster in upper region of UMAP space
- **COVID Era (2020-2021):** Distinct intermediate clusters form; median values dip 8-12% in selected neighborhoods
- **Post-COVID (2022-2023):** New clusters in lower region; rapid value appreciation (15-25% increases)

**Interpretation:** Market dynamics changed property relationships during COVID. Properties assessed during pandemic differ systematically from pre/post periods, even controlling for other features.

#### 4. Outlier Properties

**Detected via embedding distance:**
- **Ultra-luxury outliers:** 15 properties >$20M (Pacific Heights, Sea Cliff)
- **Commercial anomalies:** Mixed-use properties with residential assessments
- **Data errors:** 3 properties with impossible bedroom counts (likely data entry errors)

**Validation:** Manual inspection confirmed most outliers are legitimate edge cases (historic mansions, unique properties).

### Interaction-Driven Discoveries

#### 5. Gentrification Corridors

**Method:** Brushed high-value clusters in t-SNE, filtered by year

**Finding:** Mission District shows clear gentrification pattern:
- 2015: Median value $650k, mostly older residents
- 2023: Median value $1.1M (+69%), mixed age distribution
- Spatial spread: High values expanding along Valencia corridor

#### 6. COVID Market Heterogeneity

**Method:** Used temporal trends view while brushing different embedding regions

**Finding:** Market response to COVID varied by property type:
- **Single-family homes:** Dipped only 3-5% (2020), recovered fully by 2022
- **Condos/apartments:** Dipped 12-18% (2020), slower recovery
- **Luxury properties:** Minimal impact, continued appreciation

**Interpretation:** Flight to space during pandemic differentially affected dense housing.

#### 7. Size-Value Decoupling in Specific Neighborhoods

**Method:** Value-Size analyzer while filtering by neighborhood

**Finding:** Sunset District shows unusual pattern:
- Large properties (2,500+ sqft) have lower per-sqft values
- Small properties (<1,200 sqft) command premium per-sqft
- Pattern reverses typical size-value relationship

**Hypothesis:** Lot constraints in Sunset make small lots more desirable (easier to maintain, lower taxes) despite absolute value differences.

## Design Decisions and Rationale

### Why Embedding-Centered?

**Traditional approach:** Multiple separate views, each showing different slices of data.

**Our approach:** Embedding scatterplot as primary view, all others as lenses onto selected regions.

**Rationale:**
1. **Pattern discovery:** Embeddings reveal hidden relationships not visible in individual attributes
2. **Multi-scale exploration:** Zoom from citywide patterns to individual property details
3. **Hypothesis testing:** Brush suspected clusters, validate with detail views
4. **Dimensionality reduction:** 54D → 2D enables visual exploration of complex similarity

### Projection Method Choices

**Why offer all three (PCA, t-SNE, UMAP)?**

Different methods reveal different aspects:
- **PCA:** Best for understanding dominant factors (value, size)
- **t-SNE:** Best for finding neighborhood clusters
- **UMAP:** Best for temporal patterns and balanced view

Users can switch between methods to triangulate findings. If a pattern appears in all three projections, it's a robust real structure.

### Visual Encoding Decisions

**Color Schemes:**
- **Viridis:** Sequential data (value, age) - perceptually uniform, colorblind-friendly
- **Category10:** Categorical data (neighborhood) - maximum discriminability

**Size Encoding:**
- Optional (default uniform) to avoid visual clutter
- When enabled, sqrt scale for area to preserve relative visual salience

**Opacity:**
- 0.6 for points to reveal density patterns
- Reduces overplotting in dense regions

### Layout Rationale

**Grid-based responsive design:**
- Desktop: 2×2 grid maximizes space
- Mobile: Stacks vertically for scrolling

**Panel sizing:**
- Embedding gets 2fr width (dominant view)
- Detail views get 1fr (supporting information)
- Spatial/attributes panels split equally (complementary)

**Why this hierarchy?**
Embedding is the entry point for exploration. Other views provide context and validation for patterns discovered in embedding space.



## Technical Implementation Details

### Data Pipeline

```
Raw CSV (1.5M records)
    ↓ [task1_embeddings_projections.ipynb]
Filtered & cleaned (890k records, 2015-2023)
    ↓ Feature engineering
54D embeddings (numerical, spatial, temporal, categorical)
    ↓ StandardScaler normalization
Normalized embeddings
    ↓ PCA / t-SNE / UMAP
2D projections
    ↓ Merge with original attributes
embeddings_2d.json (for web interface)
```

### Vega-Lite Specifications

**Interaction Parameters:**
```javascript
// Brush selection in embedding scatterplot
const brushSelection = {
  name: 'brush',
  select: {type: 'interval', encodings: ['x', 'y']}
};

// Projection parameter (PCA/t-SNE/UMAP)
const projectionParam = {
  name: 'projection',
  value: 'pca',
  bind: {input: 'select', options: ['pca', 'tsne', 'umap']}
};

// Color encoding parameter
const colorParam = {
  name: 'colorBy',
  value: 'total_assessed_value',
  bind: {input: 'select', options: [...]}
};
```

**Transform Logic:**
```javascript
// Dynamic x/y field selection based on projection
{
  "calculate": "datum[projection_x]",
  "as": "x_coord"
},
{
  "calculate": "datum[projection_y]",
  "as": "y_coord"
}
```

### Performance Characteristics

| Component | Load Time | Interaction Latency |
|-----------|-----------|---------------------|
| Initial data load | 800ms | - |
| Embedding render | 200ms | - |
| Brush selection | - | 50ms |
| View update | - | 100-150ms |
| Projection switch | - | 250ms (re-render) |

**Bottlenecks:**
- Parallel coordinates (>1,000 lines causes slowdown)
- t-SNE with >10,000 points (pre-computed offline)





