
// Initiate at 0, 1 for shown, 2 for cancelled: 2 to not show ever
var BannerShown = 0;
var Option = 0;
var Selected_Site = "874:CO:SNTL";
var Selected_Site_Link;
var Selected_SiteName;
var Selected_SiteID;
var Selected_Site_Triplet;
var Selected_Site_HasWind;
var map;
var state_selected = "CO";
var DisplayString;
var o3 = "off";
var Selected_Elevation = 0;
var states = [
    "CO",
    "WA",
    "UT",
    "CA",
    "AK",
    "WY",
    "MT",
    "OR",
    "AZ",
    "NM",
    "NV",
    "ID"
];

// Global chart state
var currentChartData = {};
var windVisible = false;

function degToCompass(num) {
    var val = Math.floor((num / 22.5) + 0.5);
    var arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return arr[(val % 16)];
}

// Cookie Helpers
async function setCookie(c_name, value, exdays) {
    var exdate = new Date();
    exdate.setDate(exdate.getDate() + exdays);
    var c_value = escape(value) + ((exdays == null) ? "" : "; expires=" + exdate.toUTCString());
    document.cookie = c_name + "=" + c_value;
}

function getCookie(c_name) {
    var i, x, y, ARRcookies = document.cookie.split(";");
    for (i = 0; i < ARRcookies.length; i++) {
        x = ARRcookies[i].substr(0, ARRcookies[i].indexOf("="));
        y = ARRcookies[i].substr(ARRcookies[i].indexOf("=") + 1);
        x = x.replace(/^\s+|\s+$/g, "");
        if (x == c_name) {
            return unescape(y);
        }
    }
    return "";
}

function set_state_cookie(state) {
    document.cookie = "state=" + state;
    return;
}

function changeState() {
    state_selected = document.getElementById("State_Selecter").value;
    get_new_map(state_selected, Option);
    try {
        set_state_cookie(state_selected);
        ga("send", "event", "Change State", state_selected, "Cookie Set");
    } catch (error) {
        console.log("Unable to Set Cookie for State Selected", error);
    }
}

function changeData(Option) {
    change_map_data(Option);
    var snowChart = document.getElementById("snowchart");
    if (!snowChart || !snowChart.classList.contains("active")) {
        get_map_legend(Option);
    }
}

function overlay_on() {
    // document.getElementById("overlay").style.display = "block";
    // document.getElementById("overlay2").style.display = "block";
}
function overlay_off() {
    // document.getElementById("overlay").style.display = "none";
    // document.getElementById("overlay2").style.display = "none";
}
function overlay_3_toggle() {
    if (o3 == "on") {
        ga("send", "event", "PWA", "Show Install Info", "Probably iOS");
        document.getElementById("overlay3").style.display = "none";
        o3 = "off";
        return;
    }
    if (o3 == "off") {
        document.getElementById("overlay3").style.display = "block";
        o3 = "on";
        return;
    }
}

function toggleInfoModal() {
    var modal = document.getElementById("infoModal");
    if (modal.style.display === "none") {
        modal.style.display = "flex";
        ga("send", "event", "UI", "Info Modal", "Open");
    } else {
        modal.style.display = "none";
    }
}

function resetLegendPosition() {
    var div = document.getElementById('legenddiv');
    if (div) {
        div.style.top = '';
        div.style.left = '';
        div.style.bottom = ''; // Clear bottom overrides
        div.style.position = ''; // Allow it to revert to CSS default
    }
}

window.addEventListener('resize', resetLegendPosition);

function addListeners() {
    var legendDiv = document.getElementById('legenddiv');
    if (legendDiv) {
        legendDiv.addEventListener('mousedown', mouseDown, true);
        legendDiv.addEventListener('touchstart', mouseDown, true);
        window.addEventListener('mouseup', mouseUp, true);
        legendDiv.addEventListener('touchend', mouseUp, true);
    }
}

function mouseUp() {
    window.removeEventListener('mousemove', divMove, true);
    var legendDiv = document.getElementById('legenddiv');
    if (legendDiv) {
        legendDiv.removeEventListener('touchmove', divMove, true);
    }
}

function mouseDown(e) {
    e.preventDefault();
    window.addEventListener('mousemove', divMove, true);
    document.getElementById('legenddiv').addEventListener('touchmove', divMove, true);
}

function divMove(e) {
    var div = document.getElementById('legenddiv');
    var pageX = (e.type.toLowerCase() === 'mousemove')
        ? e.clientX
        : e.touches[0].pageX;

    var pageY = (e.type.toLowerCase() === 'mousemove')
        ? e.clientY
        : e.touches[0].pageY;

    pageX = pageX - 20;
    pageY = pageY - 75;

    div.style.position = 'absolute';
    div.style.bottom = 'auto';
    div.style.top = pageY + 'px';
    div.style.left = pageX + 'px';
}

function iOS() {
    return [
        'iPad Simulator',
        'iPhone Simulator',
        'iPod Simulator',
        'iPad',
        'iPhone',
        'iPod'
    ].includes(navigator.platform)
        // For iOS 13+
        || (navigator.userAgent.includes("Mac") && "ontouchend" in document)
}

let myChart;

async function fetchWeather(URL) {
    const response = await fetch(URL);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}

const toggleWind = () => {
    windVisible = !windVisible;
    const btn = document.getElementById("wind_toggle_btn");
    if (windVisible) {
        btn.innerHTML = "Hide Wind";
    } else {
        btn.innerHTML = "Show Wind";
    }
    renderChart();
    ga("send", "event", "Chart", "Toggle Wind", windVisible ? "Show" : "Hide");
};

const renderChart = () => {
    const ctx = document.getElementById("snowChart").getContext('2d');
    if (myChart) myChart.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f9fafb' : '#666';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(200, 200, 200, 0.5)';

    const {
        chartLabels,
        SnowDepthData,
        AirTempColor,
        AirTempData,
        WindSpeedData,
        WindGustData,
        WindDirData,
        hasWind,
        DisplayString,
        rawWindDirection
    } = currentChartData;

    const datasets = [
        {
            label: "Snow Depth (in)",
            data: SnowDepthData,
            backgroundColor: "rgba(200, 200, 200, 1)",
            borderColor: "rgba(200, 200, 200, 1)",
            fill: false,
            pointBackgroundColor: context => AirTempColor[context.dataIndex],
            yAxisID: "y-axis-snow"
        }
    ];

    // Conditional Wind Data
    if (windVisible && hasWind === "Yes") {
        if (WindSpeedData && WindSpeedData.length > 0) {
            datasets.push({
                label: "Avg Wind (mph)",
                data: WindSpeedData,
                borderColor: "#5587a2",
                backgroundColor: "rgba(85,135,162,0.1)",
                fill: false,
                pointRadius: 0,
                yAxisID: "y-axis-wind"
            });
        }

        if (WindGustData && WindGustData.length > 0) {
            datasets.push({
                label: "Max Wind (mph)",
                data: WindGustData,
                borderColor: "#690000",
                backgroundColor: "rgba(105,0,0,0.1)",
                fill: false,
                pointRadius: 0,
                yAxisID: "y-axis-wind"
            });
        }
    }

    const windDirPlugin = {
        afterDatasetsDraw: function (chart) {
            // Only draw arrows if wind visible and data exists
            if (!windVisible || hasWind !== "Yes" || !rawWindDirection || Object.keys(rawWindDirection).length === 0) return;

            const ctx = chart.ctx;
            const windDatasetMeta = chart.getDatasetMeta(1);
            if (!windDatasetMeta) return;

            ctx.save();
            windDatasetMeta.data.forEach((point, i) => {
                if (!point || !WindDirData[i] || isNaN(WindDirData[i])) return;
                const angle = (WindDirData[i] + 270) * Math.PI / 180;
                const x = point._model.x;
                const y = point._model.y;
                const len = 15;
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(angle);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(len, 0);
                ctx.lineTo(len - 4, -3);
                ctx.moveTo(len, 0);
                ctx.lineTo(len - 4, 3);
                ctx.strokeStyle = "#888";
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.restore();
            });
            ctx.restore();
        }
    };

    const yAxes = [
        {
            id: "y-axis-snow",
            position: "left",
            scaleLabel: { display: true, labelString: "Snow Depth (inches)" },
            ticks: { min: 0, suggestedMax: 100, beginAtZero: true },
            gridLines: { color: "rgba(200, 200, 200, 0.5)" }
        }
    ];

    if (windVisible && hasWind === "Yes" && (WindSpeedData || WindGustData)) {
        yAxes.push({
            id: "y-axis-wind",
            position: "right",
            scaleLabel: { display: true, labelString: "Wind Speed (mph)" },
            ticks: { min: 0, suggestedMax: 20 },
            gridLines: { drawOnChartArea: false }
        });
    }

    const chartTitleText = (windVisible && hasWind === "Yes")
        ? [DisplayString, "Snow Depth, Temp, & Wind"]
        : [DisplayString, "Snow Depth & Temp"];

    myChart = new Chart(ctx, {
        type: "line",
        data: { labels: chartLabels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            title: {
                display: true,
                text: chartTitleText,
                fontSize: 20,
                fontColor: textColor
            },
            legend: {
                labels: {
                    fontColor: textColor
                }
            },
            tooltips: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    label: function (tooltipItem, data) {
                        const datasetLabel = data.datasets[tooltipItem.datasetIndex].label || '';
                        if (tooltipItem.datasetIndex === 0) { // Snow Depth
                            return `Snow Depth: ${tooltipItem.yLabel}"`;
                        }
                        return `${datasetLabel}: ${tooltipItem.yLabel} mph`;
                    },
                    afterLabel: function (tooltipItem, data) {
                        if (tooltipItem.datasetIndex === 0) { // Only show for snow depth point
                            const temp = AirTempData[tooltipItem.index];
                            if (temp !== undefined) return `Air Temp: ${temp}°F`;
                        }
                    },
                    footer: function (tooltipItems, data) {
                        if (!windVisible || hasWind !== "Yes" || !rawWindDirection) return;
                        const idx = tooltipItems[0].index;
                        const dir = WindDirData[idx];
                        if (dir !== undefined) {
                            return `Wind Dir: ${degToCompass(dir)}`;
                        }
                    }
                }
            },
            scales: {
                xAxes: [{
                    type: "time",
                    time: { tooltipFormat: "MM-DD HH:mm", unit: "day" },
                    gridLines: { color: gridColor },
                    ticks: { fontColor: textColor },
                    scaleLabel: {
                        display: false,
                        fontColor: textColor
                    }
                }],
                yAxes: yAxes.map(axis => ({
                    ...axis,
                    gridLines: { color: gridColor },
                    ticks: { ...axis.ticks, fontColor: textColor },
                    scaleLabel: { ...axis.scaleLabel, fontColor: textColor }
                }))
            }
        },
        plugins: [windDirPlugin]
    });
};

const setData = async Selected_Site => {
    const loadingIndicator = document.getElementById("loading-indicator");
    const snowChartCanvas = document.getElementById("snowChart");
    const noDataWarning = document.getElementById("no-data-warning");
    const windToggleBtn = document.getElementById("wind_toggle_btn");

    loadingIndicator.style.display = "block";
    snowChartCanvas.style.visibility = "hidden";
    noDataWarning.style.display = "none";
    windToggleBtn.style.display = "none";

    // Destroy existing chart immediately to prevent background resizing/glitches
    if (myChart) {
        myChart.destroy();
        myChart = null;
    }

    // Reset Render State
    windVisible = false;
    windToggleBtn.innerHTML = "Show Wind";

    try {
        console.log(Selected_SiteName, Selected_Site);
        DisplayString =
            Selected_SiteName + " - " + parseInt(Selected_Elevation) + "ft";

        const urls = {
            snowDepth: "https://api.snotel.info/hourly/" + Selected_Site + "/SNWD",
            airTemp: "https://api.snotel.info/hourly/" + Selected_Site + "/TOBS"
        };

        if (Selected_Site_HasWind === "Yes") {
            urls.windSpeed = "https://api.snotel.info/hourly/" + Selected_Site + "/WSPDV";
            urls.windGust = "https://api.snotel.info/hourly/" + Selected_Site + "/WSPDX";
            urls.windDir = "https://api.snotel.info/hourly/" + Selected_Site + "/WDIRV";
        }

        const [rawSNWD, rawTOBS, rawWindSpeed, rawGustSpeed, rawWindDirection] = await Promise.all([
            fetchWeather(urls.snowDepth),
            fetchWeather(urls.airTemp),
            urls.windSpeed ? fetchWeather(urls.windSpeed) : Promise.resolve(null),
            urls.windGust ? fetchWeather(urls.windGust) : Promise.resolve(null),
            urls.windDir ? fetchWeather(urls.windDir) : Promise.resolve(null)
        ]);

        if (!rawSNWD || Object.keys(rawSNWD).length === 0) {
            noDataWarning.style.display = "block";
            loadingIndicator.style.display = "none";
            return;
        }

        const timestamps = [];
        const SnowDepthData = [];
        const AirTempData = [];
        const AirTempColor = [];
        const WindSpeedData = [];
        const WindGustData = [];
        const WindDirData = [];

        if (rawSNWD) {
            for (let i = 0; i < rawSNWD.length; i++) {
                const record = rawSNWD[i];
                timestamps.push(record.dateTime);

                if (record.value >= 0) {
                    SnowDepthData.push(parseInt(record.value));
                } else if (record.value >= -10) {
                    SnowDepthData.push(0);
                } else {
                    SnowDepthData.push(undefined);
                }
            }
        }

        const dataMap = {};
        if (rawTOBS && Object.keys(rawTOBS).length > 0) {
            rawTOBS.forEach(d => (dataMap[d.dateTime] = { ...dataMap[d.dateTime], temp: parseInt(d.value) }));
        }
        if (rawWindSpeed && Object.keys(rawWindSpeed).length > 0) {
            rawWindSpeed.forEach(d => (dataMap[d.dateTime] = { ...dataMap[d.dateTime], windSpeed: parseInt(d.value) }));
        }
        if (rawGustSpeed && Object.keys(rawGustSpeed).length > 0) {
            rawGustSpeed.forEach(d => (dataMap[d.dateTime] = { ...dataMap[d.dateTime], windGust: parseInt(d.value) }));
        }
        if (rawWindDirection && Object.keys(rawWindDirection).length > 0) {
            rawWindDirection.forEach(d => (dataMap[d.dateTime] = { ...dataMap[d.dateTime], windDir: parseInt(d.value) }));
        }

        timestamps.forEach(ts => {
            const data = dataMap[ts] || {};
            AirTempData.push(data.temp);
            WindSpeedData.push(data.windSpeed);
            WindGustData.push(data.windGust);
            WindDirData.push(data.windDir);

            if (data.temp !== undefined) {
                let color, percent_light, hsl_string;
                if (data.temp > 30) {
                    color = 0;
                    percent_light = Math.max(10, Math.min(100, 162 - data.temp * 2));
                } else {
                    color = 237;
                    percent_light = Math.max(10, Math.min(100, 3 * data.temp + 10));
                }
                hsl_string = `hsl(${color}, 100%, ${percent_light}%)`;
                AirTempColor.push(hsl_string);
            } else {
                AirTempColor.push(undefined);
            }
        });

        // Store data in global
        var chartLabels = timestamps.map(t => moment(t, "YYYY-MM-DD HH:mm").toDate());

        currentChartData = {
            chartLabels,
            SnowDepthData,
            AirTempData,
            AirTempColor,
            WindSpeedData,
            WindGustData,
            WindDirData,
            hasWind: Selected_Site_HasWind,
            DisplayString,
            rawWindDirection: rawWindDirection
        };

        // Show button if wind exists
        if (Selected_Site_HasWind === "Yes") {
            windToggleBtn.style.display = "block";
        }

        renderChart();
        snowChartCanvas.style.visibility = "visible";

    } catch (error) {
        console.error("Failed to load site data:", error);
        loadingIndicator.style.display = "none";
        snowChartCanvas.style.visibility = "hidden";
        noDataWarning.innerHTML = "<h3>Site data not returned as requested</h3><p>Please try again later.</p>";
        noDataWarning.style.display = "block";
    } finally {
        loadingIndicator.style.display = "none";
    }
};

change_map_data = function (Option) {
    if (Option == 0) {
        Color = "TodayColor";
        Time = "Today";
    }
    if (Option == 1) {
        Color = "OneDayColor";
        Time = "OneDayChange";
    }
    if (Option == 5) {
        Color = "FiveDayColor";
        Time = "FiveDayChange";
    }
    if (Option == 4) {
        Color = "elevationColor";
        Time = "elevation";
    }
    if (Option == 6) {
        Color = "avgColor";
        Time = "Avg";
    }

    map.data.setStyle(function (feature) {
        var color = "#" + feature.getProperty(Color);
        if (Time == "elevation") {
            var labeler = parseInt(feature.getProperty(Time) / 100) / 10;
        } else if (Time == "Avg") {
            var labeler = parseInt(feature.getProperty(Time)) + '%';
        } else {
            var labeler = feature.getProperty(Time) + '"';
        }
        return {
            label: labeler,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 15,
                fillColor: color,
                fillOpacity: 1,
                strokeWeight: 1,
                strokeColor: color
            }
        };
    });
};

get_map_legend = function (Option) {
    var leg_tit = document.getElementById("legend_title");
    var L5 = document.getElementById("L5");
    var L4 = document.getElementById("L4");
    var L3 = document.getElementById("L3");
    var L2 = document.getElementById("L2");
    var L1 = document.getElementById("L1");
    var L0 = document.getElementById("L0");

    var T5 = document.getElementById("T5");
    var T4 = document.getElementById("T4");
    var T3 = document.getElementById("T3");
    var T2 = document.getElementById("T2");
    var T1 = document.getElementById("T1");
    var T0 = document.getElementById("T0");

    if (Option == 0) {
        T5.innerHTML = '100"';
        T4.innerHTML = '80"';
        T3.innerHTML = '60"';
        T2.innerHTML = '40"';
        T1.innerHTML = '20"';
        T0.innerHTML = '0"';
        leg_tit.innerHTML = 'Current Depth';
    }
    if (Option == 1) {
        T5.innerHTML = '+9"';
        T4.innerHTML = '+6"';
        T3.innerHTML = '+3"';
        T2.innerHTML = '-3"';
        T1.innerHTML = '-6"';
        T0.innerHTML = '-9"';
        leg_tit.innerHTML = '1 Day Depth';
    }
    if (Option == 5) {
        T5.innerHTML = '+18"';
        T4.innerHTML = '+12"';
        T3.innerHTML = '+6"';
        T2.innerHTML = '-6"';
        T1.innerHTML = '-12"';
        T0.innerHTML = '-18"';
        leg_tit.innerHTML = '5 Day Depth';
    }
    if (Option == 4) {
        T5.innerHTML = '11k"';
        T4.innerHTML = '10k"';
        T3.innerHTML = '9k"';
        T2.innerHTML = '8k"';
        T1.innerHTML = '7k"';
        T0.innerHTML = '6k"';
        leg_tit.innerHTML = 'SnoTel Elevation';

        L0.style.backgroundColor = "#228B22";
        L1.style.backgroundColor = "#4EA24E";
        L2.style.backgroundColor = "#7AB97A";
        L3.style.backgroundColor = "#A6D0A6";
        L4.style.backgroundColor = "#D2E7D2";
        L5.style.backgroundColor = "#FFFFFF";
    }
    if (Option == 6) {
        T5.innerHTML = '150%';
        T4.innerHTML = '120%';
        T3.innerHTML = '90%';
        T2.innerHTML = '60%';
        T1.innerHTML = '30%';
        T0.innerHTML = '0%';
        leg_tit.innerHTML = '% Avg SWE';
    }

    if (Option != 4) {
        L0.style.backgroundColor = "#FF0000";
        L1.style.backgroundColor = "#E54C4C";
        L2.style.backgroundColor = "#CB9898";
        L3.style.backgroundColor = "#CBCBCB";
        L4.style.backgroundColor = "#E5E5E5";
        L5.style.backgroundColor = "#FFFFFF";
    }
}

get_chart_legend = function () {
    var leg_tit = document.getElementById("legend_title");
    var L5 = document.getElementById("L5");
    var L4 = document.getElementById("L4");
    var L3 = document.getElementById("L3");
    var L2 = document.getElementById("L2");
    var L1 = document.getElementById("L1");
    var L0 = document.getElementById("L0");

    var T5 = document.getElementById("T5");
    var T4 = document.getElementById("T4");
    var T3 = document.getElementById("T3");
    var T2 = document.getElementById("T2");
    var T1 = document.getElementById("T1");
    var T0 = document.getElementById("T0");

    leg_tit.innerHTML = 'Air Temp';
    T5.innerHTML = "40F";
    T4.innerHTML = "32F";
    T3.innerHTML = "24F";
    T2.innerHTML = "16F";
    T1.innerHTML = "8F";
    T0.innerHTML = "0F";

    L5.style.backgroundColor = "red";
    L4.style.backgroundColor = "#FFFFFF";
    L3.style.backgroundColor = "#6666CC";
    L2.style.backgroundColor = "#0000BB";
    L1.style.backgroundColor = "#000066";
    L0.style.backgroundColor = "#000000";
}

get_new_map = function (State_Selected, Option) {
    console.log(State_Selected);
    console.log(Option);
    var map_focus;
    var zoom;

    if (Option == 0) { Color = "TodayColor"; Time = "Today"; }
    if (Option == 1) { Color = "OneDayColor"; Time = "OneDayChange"; }
    if (Option == 5) { Color = "FiveDayColor"; Time = "FiveDayChange"; }
    if (Option == 6) { Color = "avgColor"; Time = "Avg"; }

    if (State_Selected == "UT") { map_focus = { lat: 40.344, lng: -112.036 }; zoom = 7; }
    if (State_Selected == "AK") { map_focus = { lat: 62.344, lng: -145.036 }; zoom = 5; }
    if (State_Selected == "AZ") { map_focus = { lat: 35.044, lng: -111.536 }; zoom = 7; }
    if (State_Selected == "CA") { map_focus = { lat: 40.144, lng: -120.036 }; zoom = 7; }
    if (State_Selected == "CO") { map_focus = { lat: 39.344, lng: -106.236 }; zoom = 7; }
    if (State_Selected == "WA") { map_focus = { lat: 47.544, lng: -121.886 }; zoom = 7; }
    if (State_Selected == "OR") { map_focus = { lat: 44.144, lng: -119.036 }; zoom = 7; }
    if (State_Selected == "MT") { map_focus = { lat: 47.144, lng: -110.036 }; zoom = 6; }
    if (State_Selected == "NV") { map_focus = { lat: 39.144, lng: -115.036 }; zoom = 6; }
    if (State_Selected == "NM") { map_focus = { lat: 35.244, lng: -104.886 }; zoom = 7; }
    if (State_Selected == "ID") { map_focus = { lat: 46.144, lng: -112.036 }; zoom = 6; }
    if (State_Selected == "WY") { map_focus = { lat: 43.544, lng: -107.886 }; zoom = 6; }

    map = new google.maps.Map(document.getElementById("map"), {
        zoom: zoom,
        center: map_focus,
        mapTypeId: "hybrid",
        disableDefaultUI: true, // Clean up the map for mobile
        zoomControl: false,
        mapTypeControl: false,
        scaleControl: false,
        streetViewControl: false,
        rotateControl: false,
        fullscreenControl: false
    });

    const initURL = "https://api.snotel.info/state/" + State_Selected;

    // Restore saved state for this location if available
    var savedStateCookie = getCookie("mapState_" + State_Selected);
    if (savedStateCookie) {
        var splitStr = savedStateCookie.split("_");
        var savedMapLat = parseFloat(splitStr[0]);
        var savedMapLng = parseFloat(splitStr[1]);
        var savedMapZoom = parseFloat(splitStr[2]);

        if ((!isNaN(savedMapLat)) && (!isNaN(savedMapLng)) && (!isNaN(savedMapZoom))) {
            map.setCenter(new google.maps.LatLng(savedMapLat, savedMapLng));
            map.setZoom(savedMapZoom);
        }
    }

    // Re-attach listeners to ensure state is saved when user moves map
    google.maps.event.addListener(map, 'tilesloaded', tilesLoaded);

    fetch(initURL)
        .then(response => {
            if (!response.ok) {
                throw new Error("HTTP error " + response.status);
            }
            return response.text();
        })
        .then(data => {
            map.data.addGeoJson(JSON.parse(data));

            map.data.setStyle(function (feature) {
                var color = "#" + feature.getProperty(Color);
                if (Time == "elevation") {
                    var labeler = parseInt(feature.getProperty(Time) / 100) / 10;
                } else if (Time == "Avg") {
                    var labeler = parseInt(feature.getProperty(Time)) + '%';
                } else {
                    var labeler = feature.getProperty(Time) + '"';
                }

                return {
                    label: labeler,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 15,
                        fillColor: color,
                        fillOpacity: 1,
                        strokeWeight: 1,
                        strokeColor: color
                    }
                };
            });

            map.data.addListener("click", function (event) {
                Selected_Site_Triplet = event.feature.getProperty("stationTriplet");
                Selected_SiteID = event.feature.getProperty("name");
                Selected_SiteName = event.feature.getProperty("name");
                Selected_Elevation = event.feature.getProperty("elevation");
                Selected_Site_HasWind = event.feature.getProperty("Wind");

                setData(Selected_Site_Triplet);
                get_chart_legend();
                ga("send", "event", "Map Click", Selected_Site_Triplet, "Marker Click");

                var x = document.getElementById("map");
                var y = document.getElementById("snowchart");

                // Show chart with animation
                y.classList.add("active");

                var z = document.getElementById("back_to_map");
                z.style.display = "flex";

                // Move legend to chart view so it sits on top (z-index 20 > 10)
                var legend = document.getElementById("legenddiv");
                y.appendChild(legend);

                overlay_off();
            });
        })
        .catch(function (error) {
            console.error("Failed to load map data:", error);
            var noDataWarning = document.getElementById('no-data-warning');
            noDataWarning.innerHTML = "<h3>Map data not returned</h3><p>Please try again later.</p>";
            noDataWarning.style.display = 'block';
        });

    return map;
};

async function saveMapState() {
    var mapZoom = map.getZoom();
    var mapCentre = map.getCenter();
    var mapLat = mapCentre.lat();
    var mapLng = mapCentre.lng();
    var cookiestring = mapLat + "_" + mapLng + "_" + mapZoom;
    setCookie("mapState_" + state_selected, cookiestring, 30);
}

function tilesLoaded() {
    google.maps.event.clearListeners(map, 'tilesloaded');
    google.maps.event.addListener(map, 'zoom_changed', saveMapState);
    google.maps.event.addListener(map, 'dragend', saveMapState);
}

function selectWelcomeState(state) {
    document.getElementById("State_Selecter").value = state;
    changeState();
    document.getElementById("welcomeScreen").style.display = "none";
}

// Theme Toggle Logic
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);

    // Update chart if visible
    if (document.getElementById("snowchart").classList.contains("active") && typeof renderChart === 'function') {
        renderChart();
    }
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (theme === 'dark') {
        icon.className = 'fa fa-sun-o';
    } else {
        icon.className = 'fa fa-moon-o';
    }
}

// Initialize Theme
(function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
        updateThemeIcon('dark');
    }
})();

window.initMap = function () {
    // Load saved state from cookie or default
    var cookie = getCookie("state");
    console.log("State Cookie: ", cookie);

    // Update global state_selected
    if (states.includes(cookie)) {
        state_selected = cookie;
        document.getElementById("State_Selecter").value = cookie;
    } else {
        // No cookie found, show welcome screen
        document.getElementById("welcomeScreen").style.display = "flex";

        // Still default to CO for the background map
        state_selected = "CO";
        document.getElementById("State_Selecter").selectedIndex = 3; // CO index
    }

    // Initialize map with correct state
    map = get_new_map(state_selected, Option);

    get_map_legend(Option);
};

function returnToMap() {
    var legend = document.getElementById("legenddiv");
    var x = document.getElementById("map");
    var y = document.getElementById("snowchart");
    var z = document.getElementById("back_to_map");

    if (y.classList.contains("active")) {
        //snow chart is showing, go back to map
        y.classList.remove("active");
        z.style.display = "none";
        legend.style.display = "flex";

        // Move legend back to UI layer
        var uiLayer = document.getElementById("ui-layer");
        uiLayer.appendChild(legend);

        overlay_on();
        if (typeof $.fn.slick === 'function') {
            $(".slick-slider").slick("setPosition");
        }
        get_map_legend(Option);
    }
}

// Service Worker & Event Listeners
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/service-worker.js").then(reg => {
            console.log("Service worker registered.", reg);
        });
    });
}
window.addEventListener("load", function () {
    window.history.pushState({}, "");
});

window.addEventListener("popstate", function () {
    if (document.getElementById("snowchart").classList.contains("active")) {
        window.history.pushState({}, "");
        returnToMap();
    }
});

window.onload = function () {
    addListeners();
    updateOnlineStatus();
};
window.addEventListener('resize', resetLegendPosition);
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

function updateOnlineStatus() {
    const offlineOverlay = document.getElementById("offline-overlay");
    if (!offlineOverlay) return;

    if (navigator.onLine) {
        offlineOverlay.style.display = "none";
    } else {
        offlineOverlay.style.display = "flex";
    }
}

// Slick Carousel Initialization
$(document).ready(function () {
    $(".slider-class").slick({
        centerMode: true,
        centerPadding: "0px",
        slidesToShow: 1,
        arrows: true,
        prevArrow: '<button type="button" class="slick-prev"><i class="fa fa-chevron-left"></i></button>',
        nextArrow: '<button type="button" class="slick-next"><i class="fa fa-chevron-right"></i></button>',
        responsive: [
            {
                breakpoint: 768,
                settings: {
                    centerMode: true,
                    centerPadding: "0px",
                    slidesToShow: 1,
                    arrow: true
                }
            },
            {
                breakpoint: 600,
                settings: {
                    centerMode: true,
                    centerPadding: "0px",
                    slidesToShow: 1,
                    arrows: true
                }
            }
        ]
    });

    $(".slider-class").on("afterChange", function (
        event,
        slick,
        currentSlide
    ) {
        console.log(currentSlide);
        if (currentSlide == 0) Option = 0;
        if (currentSlide == 1) Option = 1;
        if (currentSlide == 2) Option = 5;
        if (currentSlide == 3) Option = 4;
        if (currentSlide == 4) Option = 6;
        changeData(Option);
    });
});