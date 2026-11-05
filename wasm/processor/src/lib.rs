// use wasm_bindgen::prelude::*;
// use serde::{Serialize, Deserialize};

// #[derive(Serialize, Deserialize)]
// pub struct Row {
//     pub id: String,
//     pub total: f64,
// }

// #[wasm_bindgen]
// pub fn process(data: JsValue) -> JsValue {
//     let rows: Vec<Vec<String>> =a
//         serde_wasm_bindgen::from_value(data).unwrap();

//     let mut result: Vec<Row> = rows.iter()
//         .filter(|r| r.len() >= 3 && r[2] != "VOID")
//         .map(|r| Row {
//             id: r[0].clone(),
//             total: r[1].parse::<f64>().unwrap_or(0.0) * 1.08,
//         })
//         .collect();

//     result.sort_by(|a, b| b.total.partial_cmp(&a.total).unwrap());
//     serde_wasm_bindgen::to_value(&result).unwrap()
// }



use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

#[derive(Clone, Deserialize, Serialize)]
pub struct Record {
    pub id: String,
    pub name: String,
    pub bmi: f64,
    pub category: String,
    pub risk_level: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    count: usize,
    average_bmi: f64,
    duplicate_ids: usize,
}

fn build_search_index(records: &[Record]) -> Vec<Vec<String>> {
    records
        .iter()
        .map(|record| vec![
            record.id.to_lowercase(),
            record.name.to_lowercase(),
            record.category.to_lowercase(),
            record.risk_level.to_lowercase(),
        ])
        .collect()
}

fn query_indices(
    records: &[Record],
    search_index: &[Vec<String>],
    query: &str,
    category: &str,
    sort_by: &str,
    descending: bool,
) -> Vec<u32> {
    let query = query.to_lowercase();
    let mut indices: Vec<u32> = records
        .iter()
        .enumerate()
        .filter(|(index, record)| {
            let category_matches = category.is_empty() || record.category == category;
            let query_matches = query.is_empty()
                || search_index[*index].iter().any(|field| field.contains(&query));
            category_matches && query_matches
        })
        .map(|(index, _)| index as u32)
        .collect();

    indices.sort_by(|left, right| {
        let left_record = &records[*left as usize];
        let right_record = &records[*right as usize];
        let ordering = match sort_by {
            "name" => left_record.name.cmp(&right_record.name),
            "bmi" => left_record.bmi.total_cmp(&right_record.bmi),
            "category" => left_record.category.cmp(&right_record.category),
            _ => left_record.id.cmp(&right_record.id),
        }
        .then_with(|| left_record.id.cmp(&right_record.id));

        if descending {
            ordering.reverse()
        } else {
            ordering
        }
    });

    indices
}

fn summarize(records: &[Record]) -> Summary {
    let mut seen = HashSet::with_capacity(records.len());
    let duplicate_ids = records
        .iter()
        .filter(|record| !seen.insert(record.id.as_str()))
        .count();
    let bmi_total = records.iter().map(|record| record.bmi).sum::<f64>();

    Summary {
        count: records.len(),
        average_bmi: if records.is_empty() {
            0.0
        } else {
            bmi_total / records.len() as f64
        },
        duplicate_ids,
    }
}

#[wasm_bindgen]
pub struct RecordEngine {
    records: Vec<Record>,
    search_index: Vec<Vec<String>>,
}

#[wasm_bindgen]
impl RecordEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(records: JsValue) -> Result<RecordEngine, JsValue> {
        let records: Vec<Record> = serde_wasm_bindgen::from_value(records)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let search_index = build_search_index(&records);
        Ok(Self { records, search_index })
    }

    pub fn query(&self, query: &str, category: &str, sort_by: &str, descending: bool) -> Vec<u32> {
        query_indices(&self.records, &self.search_index, query, category, sort_by, descending)
    }

    pub fn summary(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&summarize(&self.records))
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::{build_search_index, query_indices, summarize, Record};

    fn query(records: &[Record], text: &str, category: &str, sort_by: &str, descending: bool) -> Vec<u32> {
        query_indices(records, &build_search_index(records), text, category, sort_by, descending)
    }

    fn records() -> Vec<Record> {
        vec![
            Record { id: "2".into(), name: "Sam Lee".into(), bmi: 30.0, category: "Obese".into(), risk_level: "High".into() },
            Record { id: "1".into(), name: "Alex Kim".into(), bmi: 22.0, category: "Normal".into(), risk_level: "Low".into() },
            Record { id: "1".into(), name: "Alex Kim".into(), bmi: 24.0, category: "Normal".into(), risk_level: "Low".into() },
        ]
    }

    #[test]
    fn filters_searches_and_sorts_records() {
        assert_eq!(query(&records(), "alex", "Normal", "bmi", true), vec![2, 1]);
        assert!(query(&records(), "missing", "", "id", false).is_empty());
        assert!(query(&records(), "lee obese", "", "id", false).is_empty());
    }

    #[test]
    fn summarizes_empty_and_duplicate_records() {
        let summary = summarize(&records());
        assert_eq!(summary.count, 3);
        assert_eq!(summary.duplicate_ids, 1);
        assert!((summary.average_bmi - (76.0 / 3.0)).abs() < f64::EPSILON);
        assert_eq!(summarize(&[]).average_bmi, 0.0);
    }
}
